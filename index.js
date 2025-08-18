const path = require('path');
const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

const PORT = process.env.PORT || 3000;
const RENDER_URL = 'https://auto-clone.onrender.com';

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

const delay = ms => new Promise(res => setTimeout(res, ms));

app.post('/start', async (req, res) => {
  let { value, count } = req.body;

  if (!value) return res.status(400).json({ error: 'Missing value (phone/email)' });
  count = parseInt(count) || 1;
  if (count < 1) count = 1;
  if (count > 10) count = 10; // limit max 10 parallel runs for safety

  // Function to run one Puppeteer automation
  const runAutomation = async (instanceNumber) => {
    let browser;
    let page;
    try {
      let valueToEnter = value.toString().trim();
      const digitsOnly = valueToEnter.replace(/\D/g, '');
      const isDigits = /^\d{10,16}$/.test(digitsOnly);
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valueToEnter);
      if (!isDigits && !isEmail) throw new Error('Invalid phone/email format');
      valueToEnter = isDigits ? digitsOnly : valueToEnter;

      console.log(`➡️ Instance ${instanceNumber} starting for: ${valueToEnter}`);

      browser = await puppeteer.launch({
        headless: 'new',
        executablePath: CHROME_PATH,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1280,900'
        ],
        defaultViewport: null
      });

      page = await browser.newPage();

      // Realistic UA
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      );

      // Anti-detection tweaks
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.navigator.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      });

      // Go to login page
      await page.goto('https://10minuteschool.com/auth/login', { waitUntil: 'load', timeout: 90000 });
      await delay(2000);

      // Find input field
      const inputSelectors = [
        'input[name="userFullName"]',
        'input[placeholder*="মোবাইল"]',
        'input[placeholder*="ইমেইল"]',
        'input[type="text"]',
        'input'
      ];
      let inputFound = null;
      for (const sel of inputSelectors) {
        try { await page.waitForSelector(sel, { visible: true, timeout: 4000 }); inputFound = sel; break; } catch (_) {}
      }
      if (!inputFound) throw new Error('Login input not found');

      await page.click(inputFound, { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.type(inputFound, valueToEnter, { delay: 50 });

      // Click submit
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

      await delay(4000);

      // Screenshot
      const screenshotFile = `run_${instanceNumber}_${Date.now()}.png`;
      await page.screenshot({ path: path.join(__dirname, 'public', screenshotFile), fullPage: true });
      console.log(`📸 Instance ${instanceNumber} screenshot saved: ${RENDER_URL}/${screenshotFile}`);

      return { success: true, screenshot: `${RENDER_URL}/${screenshotFile}` };
    } catch (err) {
      console.error(`❌ Instance ${instanceNumber} failed:`, err.message);
      return { success: false, error: err.message };
    } finally {
      if (browser) await browser.close();
    }
  };

  // Run all instances in parallel
  const results = await Promise.all(Array.from({ length: count }, (_, i) => runAutomation(i + 1)));

  res.json({ results });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
