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
  let browser;
  let page;

  try {
    let phoneNumber = req.body.phoneNumber;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Missing phone number' });
    }

    phoneNumber = phoneNumber.toString().trim();
    // accept 10–16 digits (strip non-digits), or allow emails as-is
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    const isDigits = /^\d{10,16}$/.test(digitsOnly);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(phoneNumber);
    if (!isDigits && !isEmail) {
      return res.status(400).json({ error: 'Invalid phone or email format' });
    }
    const valueToEnter = isDigits ? digitsOnly : phoneNumber;

    console.log(`➡️ Starting automation for: ${valueToEnter}`);

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

    // Go to 10 Minute School login
    await page.goto('https://10minuteschool.com/auth/login', {
      waitUntil: 'load',
      timeout: 90000
    });

    await delay(3000);

    // Screenshot 1: page loaded
    const initialScreenshot = `page_loaded_${Date.now()}.png`;
    await page.screenshot({ path: path.join(__dirname, 'public', initialScreenshot), fullPage: true });
    console.log(`📸 Initial page screenshot saved: ${RENDER_URL}/${initialScreenshot}`);

    // Find the username/phone input (robust selectors)
    const inputSelectors = [
      'input[name="userFullName"]',
      'input[placeholder*="মোবাইল"]',
      'input[placeholder*="ইমেইল"]',
      'input[type="text"]',
      'input'
    ];

    let inputFound = null;
    for (const sel of inputSelectors) {
      try {
        await page.waitForSelector(sel, { visible: true, timeout: 6000 });
        inputFound = sel;
        break;
      } catch (_) { /* try next */ }
    }
    if (!inputFound) throw new Error('❌ Could not locate the login input field');

    // Type the number/email
    await page.click(inputFound, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(inputFound, valueToEnter, { delay: 75 });

    // Screenshot 2: before submit
    const beforeClickFile = `before_click_submit_${Date.now()}.png`;
    const beforeClickPath = path.join(__dirname, 'public', beforeClickFile);
    await page.screenshot({ path: beforeClickPath, fullPage: true });
    console.log(`📸 Screenshot before submit saved: ${RENDER_URL}/${beforeClickFile}`);

    // Click the submit button (robust selectors)
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
        // Optional: check visible/enabled
        try {
          await page.waitForSelector(sel, { visible: true, timeout: 3000 });
          await btn.click();
          clicked = true;
          console.log(`✅ Clicked submit button via selector: ${sel}`);
          break;
        } catch (_) { /* try next button */ }
      }
    }
    if (!clicked) throw new Error('❌ Submit button not found');

    // Wait a bit for response/navigation/UI change
    await delay(6000);

    // Screenshot 3: after submit
    const afterSubmitFile = `after_submit_${Date.now()}.png`;
    const afterSubmitPath = path.join(__dirname, 'public', afterSubmitFile);
    await page.screenshot({ path: afterSubmitPath, fullPage: true });
    console.log(`📸 After submit screenshot saved: ${RENDER_URL}/${afterSubmitFile}`);

    // Return JSON like your original shape
    res.json({
      message: '✅ Login submit attempted successfully',
      initialScreenshotUrl: `${RENDER_URL}/${initialScreenshot}`,
      beforeClickUrl: `${RENDER_URL}/${beforeClickFile}`,
      otpScreenshotUrl: `${RENDER_URL}/${afterSubmitFile}`
    });

  } catch (error) {
    console.error('❌ Automation failed:', error.message);

    try {
      if (page) {
        const errorFile = `error_screenshot_${Date.now()}.png`;
        const errorPath = path.join(__dirname, 'public', errorFile);
        await page.screenshot({ path: errorPath, fullPage: true });
        const errorUrl = `${RENDER_URL}/${errorFile}`;
        console.log(`❗ Error screenshot saved: ${errorUrl}`);

        return res.status(500).json({
          error: 'Automation failed',
          details: error.message,
          errorScreenshot: errorUrl
        });
      }
    } catch (errCap) {
      console.warn('⚠️ Could not capture error screenshot:', errCap.message);
    }

    res.status(500).json({ error: 'Automation failed', details: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
