const path = require('path');
const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

const PORT = process.env.PORT || 3000;
const USE_HTTPS = false; // Change to true if using HTTPS in production

// Chrome binary path (adjust as needed)
const CHROME_PATH = path.join(
  process.cwd(),
  '.cache',
  'chrome',
  'linux-127.0.6533.88',
  'chrome-linux64',
  'chrome'
);

// Middleware setup
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Helper for delay
const delay = ms => new Promise(res => setTimeout(res, ms));

// Main automation route
app.post('/start', async (req, res) => {
  let browser;
  try {
    let phoneNumber = req.body.phoneNumber;
    if (!phoneNumber) return res.status(400).json({ error: 'Missing phone number' });

    phoneNumber = phoneNumber.replace(/\D/g, '');
    if (!/^\d{10,}$/.test(phoneNumber)) return res.status(400).json({ error: 'Invalid phone number format' });

    console.log(`➡️ Starting OTP automation for: ${phoneNumber}`);

    // Launch Puppeteer with stability flags
    browser = await puppeteer.launch({
      headless: true,
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

    const page = await browser.newPage();

    await page.goto('https://binge.buzz/login', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await delay(2000); // small delay to allow rendering

    try {
      await page.waitForSelector('select.PhoneInputCountrySelect', { visible: true, timeout: 15000 });
      await page.select('select.PhoneInputCountrySelect', 'BD');
    } catch {
      console.warn('⚠️ Country selector not found or already set');
    }

    await page.waitForSelector('input.PhoneInputInput', { visible: true, timeout: 30000 });
    const input = await page.$('input.PhoneInputInput');
    await input.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('input.PhoneInputInput', phoneNumber, { delay: 80 });

    const entered = await page.$eval('input.PhoneInputInput', el => el.value);
    console.log('✅ Phone entered:', entered);

    const buttons = await page.$$('button.BingeBtnBase-root');
    let clicked = false;

    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (/otp|verify/i.test(text)) {
        await btn.click();
        clicked = true;
        console.log(`🟢 Clicked button: "${text}"`);
        break;
      }
    }

    if (!clicked) throw new Error('❌ No OTP or Verify button found');

    await delay(7000); // wait for response/load

    const fileName = `otp_screenshot_${Date.now()}.png`;
    const filePath = path.join(__dirname, 'public', fileName);
    await page.screenshot({ path: filePath, fullPage: true });

    const protocol = USE_HTTPS ? 'https' : 'http';
    const screenshotUrl = `${protocol}://autopro-v1s0.onrender.com/${fileName}`;

    console.log(`🖼️ Screenshot saved: ${screenshotUrl}`);

    res.json({
      message: '✅ OTP process completed',
      screenshotUrl
    });

  } catch (error) {
    console.error('❌ Automation failed:', error.message);

    if (browser) {
      try {
        const page = (await browser.pages())[0];
        const errorFile = `error_screenshot_${Date.now()}.png`;
        const errorPath = path.join(__dirname, 'public', errorFile);
        await page.screenshot({ path: errorPath, fullPage: true });

        const protocol = USE_HTTPS ? 'https' : 'http';
        const errorUrl = `${protocol}://autopro-v1s0.onrender.com/${fileName}`;
        console.log(`❗ Error screenshot: ${errorUrl}`);
      } catch (errCap) {
        console.warn('⚠️ Could not capture error screenshot:', errCap.message);
      }
    }

    res.status(500).json({ error: 'Automation failed', details: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
