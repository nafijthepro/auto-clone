const path = require('path');
const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

const PORT = process.env.PORT || 3000;
const RENDER_URL = 'https://autoclone2.onrender.com';

const CHROME_PATH = path.join(
  process.cwd(),
  '.cache',
  'chrome',
  'linux-127.0.6533.88',
  'chrome-linux64',
  'chrome'
);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/** ---------- PERF + STABILITY HELPERS ---------- **/

// Reuse one browser (HUGE speedup)
let BROWSER = null;
async function getBrowser() {
  if (BROWSER && BROWSER.process()) return BROWSER;
  BROWSER = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--blink-settings=imagesEnabled=false',
      '--window-size=1280,900'
    ],
    defaultViewport: { width: 1280, height: 900 }
  });
  console.log('✅ Chrome launched (warm pool)');
  return BROWSER;
}

// Per-run hard timeout (so a stuck run doesn’t hang others)
function withTimeout(promise, ms, label = 'task') {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`Timeout after ${ms}ms (${label})`)), ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    timeout
  ]);
}

function now() { return Date.now(); }

/** ---------- CORE AUTOMATION (fast + isolated) ---------- **/

async function runAutomation({ value, instanceNumber }) {
  const t0 = now();
  let context, page;
  try {
    const browser = await getBrowser();

    // Validate input once
    let valueToEnter = String(value).trim();
    const digitsOnly = valueToEnter.replace(/\D/g, '');
    const isDigits = /^\d{10,16}$/.test(digitsOnly);
    const isEmail  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valueToEnter);
    if (!isDigits && !isEmail) throw new Error('Invalid phone/email format');
    valueToEnter = isDigits ? digitsOnly : valueToEnter;

    // Isolated incognito context per run
    context = await browser.createIncognitoBrowserContext();
    page = await context.newPage();

    // Faster: block non-essential resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'stylesheet' || type === 'font' || type === 'media') {
        return req.abort();
      }
      req.continue();
    });

    // UA + anti-detection
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    );
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      // a couple of common props
      window.navigator.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    });
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(8000);

    console.log(`➡️ [#${instanceNumber}] start for: ${valueToEnter}`);

    // Go to login quickly: domcontentloaded is enough since we block heavy assets
    await withTimeout(
      page.goto('https://10minuteschool.com/auth/login', { waitUntil: 'domcontentloaded', timeout: 8000 }),
      9000,
      'goto'
    );

    // Targeted, fast input lookup (try specific → generic)
    const inputSelectors = [
      'input[name="userFullName"]',
      'input[placeholder*="মোবাইল"]',
      'input[placeholder*="ইমেইল"]',
      'input[type="text"]',
      'input'
    ];

    let inputSel = null;
    for (const sel of inputSelectors) {
      try {
        await page.waitForSelector(sel, { visible: true, timeout: 1500 });
        inputSel = sel; break;
      } catch (_) {}
    }
    if (!inputSel) throw new Error('Login input not found');

    await page.click(inputSel, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(inputSel, valueToEnter, { delay: 20 }); // quicker typing

    // Submit quickly
    const buttonSelectors = [
      'button[name="submitBtn"]',
      'button.bg-green.h-12.w-full.rounded.font-medium.text-white',
      'button[type="submit"]',
      'button'
    ];
    let clicked = false;
    for (const sel of buttonSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) throw new Error('Submit button not found');

    // Wait for any of: URL change | network quiet | UI change — whichever comes first
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 4000 }).catch(() => {}),
      page.waitForNetworkIdle({ idleTime: 500, timeout: 4000 }).catch(() => {}),
      page.waitForSelector('input[type="tel"], input[name*="otp"], [data-otp], .otp', { timeout: 4000 }).catch(() => {})
    ]);

    // Screenshot (viewport only = faster)
    const screenshotFile = `run_${instanceNumber}_${Date.now()}.png`;
    await page.screenshot({
      path: path.join(__dirname, 'public', screenshotFile),
      fullPage: false
    });

    const t1 = now();
    console.log(`📸 [#${instanceNumber}] saved: ${RENDER_URL}/${screenshotFile} (${t1 - t0}ms)`);

    return {
      success: true,
      screenshot: `${RENDER_URL}/${screenshotFile}`,
      ms: t1 - t0
    };
  } catch (err) {
    const t1 = now();
    console.error(`❌ [#${instanceNumber}] ${err.message} (${t1 - t0}ms)`);
    // Try to capture quick failure screenshot if page exists
    try {
      if (page) {
        const failShot = `error_run_${instanceNumber}_${Date.now()}.png`;
        await page.screenshot({ path: path.join(__dirname, 'public', failShot), fullPage: false });
        return { success: false, error: err.message, errorScreenshot: `${RENDER_URL}/${failShot}`, ms: t1 - t0 };
      }
    } catch (_) {}
    return { success: false, error: err.message, ms: t1 - t0 };
  } finally {
    // Clean up per-instance context only (keep Chrome warm)
    try { if (page) await page.close({ runBeforeUnload: false }); } catch (_) {}
    try { if (context) await context.close(); } catch (_) {}
  }
}

/** ---------- API ---------- **/

app.post('/start', async (req, res) => {
  try {
    let { value, count } = req.body;
    if (!value) return res.status(400).json({ error: 'Missing value (phone/email)' });

    count = parseInt(count) || 1;
    if (count < 1) count = 1;
    if (count > 10) count = 10;

    // Kick the browser alive early (no cold start during runs)
    await getBrowser();

    // Run all in parallel with a global safety timeout (e.g., 12s for the whole batch)
    const results = await withTimeout(
      Promise.all(Array.from({ length: count }, (_, i) => runAutomation({ value, instanceNumber: i + 1 }))),
      12000,
      'batch'
    );

    res.json({ results });
  } catch (e) {
    console.error('🔥 /start failed:', e.message);
    res.status(500).json({ error: 'Batch failed', details: e.message });
  }
});

// Health + warmup
app.get('/health', async (_req, res) => {
  try {
    await getBrowser();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, async () => {
  await getBrowser().catch(err => console.error('Browser launch error:', err.message));
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
