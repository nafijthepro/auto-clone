const path = require('path');
const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

const PORT = process.env.PORT || 3000;
const RENDER_URL = 'https://autopro-v1s0.onrender.com';

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

    phoneNumber = phoneNumber.replace(/\D/g, '');
    if (!/^\d{10,16}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    console.log(`➡️ Starting OTP automation for: ${phoneNumber}`);

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

    // Set user agent to look like a real browser
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    );

    // Prevent detection by tweaking navigator properties
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.navigator.chrome = { runtime: {} };
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    });

    // Go to login page - waiting for full load event, 90 sec timeout
    await page.goto('https://binge.buzz/login', {
      waitUntil: 'load',
      timeout: 90000
    });

    await delay(3000);

    // Screenshot after page load
    const initialScreenshot = `page_loaded_${Date.now()}.png`;
    await page.screenshot({ path: path.join(__dirname, 'public', initialScreenshot), fullPage: true });
    console.log(`📸 Initial page screenshot saved: ${RENDER_URL}/${initialScreenshot}`);

    // Try to set country if dropdown available
    try {
      await page.waitForSelector('select.PhoneInputCountrySelect', { visible: true, timeout: 7000 });
      await page.select('select.PhoneInputCountrySelect', 'BD');
      console.log('🌐 Country set to BD');
    } catch {
      console.warn('⚠️ Country selector not found or already selected');
    }

    // Try multiple selectors for phone input for robustness
    const phoneSelectors = ['input.PhoneInputInput', 'input[type=tel]', 'input[name=phone]', 'input'];

    let phoneInputSelector = null;
    for (const sel of phoneSelectors) {
      try {
        await page.waitForSelector(sel, { visible: true, timeout: 7000 });
        phoneInputSelector = sel;
        break;
      } catch {
        // ignore and try next
      }
    }

    if (!phoneInputSelector) throw new Error('❌ Phone input field not found on the page');

    await page.click(phoneInputSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(phoneInputSelector, phoneNumber, { delay: 75 });

    const entered = await page.$eval(phoneInputSelector, el => el.value);
    console.log('📲 Phone entered:', entered);

    // Screenshot before clicking OTP button
    const beforeClickFile = `before_click_otp_${Date.now()}.png`;
    const beforeClickPath = path.join(__dirname, 'public', beforeClickFile);
    await page.screenshot({ path: beforeClickPath, fullPage: true });
    console.log(`📸 Screenshot before OTP click saved: ${RENDER_URL}/${beforeClickFile}`);

    // Find OTP or Verify button & click it
    const buttons = await page.$$('button.BingeBtnBase-root');
    let clicked = false;
    for (const btn of buttons) {
      const text = (await page.evaluate(el => el.textContent, btn)) || '';
      if (/otp|verify/i.test(text)) {
        await btn.click();
        clicked = true;
        console.log(`✅ Clicked button: "${text.trim()}"`);
        break;
      }
    }

    if (!clicked) throw new Error('❌ No OTP or Verify button found');

    await delay(6000);

    // Screenshot after clicking OTP
    const otpFile = `otp_screenshot_${Date.now()}.png`;
    const otpPath = path.join(__dirname, 'public', otpFile);
    await page.screenshot({ path: otpPath, fullPage: true });
    console.log(`📸 OTP screenshot saved: ${RENDER_URL}/${otpFile}`);

    res.json({
      message: '✅ OTP process completed',
      initialScreenshotUrl: `${RENDER_URL}/${initialScreenshot}`,
      beforeClickUrl: `${RENDER_URL}/${beforeClickFile}`,
      otpScreenshotUrl: `${RENDER_URL}/${otpFile}`
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
