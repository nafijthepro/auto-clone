const path = require('path');
const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 3000;

// If using HTTPS, ensure certs are valid (only if needed)
const USE_HTTPS = false;

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

app.post('/start', async (req, res) => {
  let browser;
  try {
    let phoneNumber = req.body.phoneNumber;
    if (!phoneNumber) return res.status(400).json({ error: 'Missing phone number' });

    phoneNumber = phoneNumber.replace(/\D/g, '');
    if (!/^\d{10,}$/.test(phoneNumber)) return res.status(400).json({ error: 'Invalid phone number format' });

    console.log(`➡️ Starting OTP automation for: ${phoneNumber}`);

    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 900 },
    });

    const page = await browser.newPage();

    // Use networkidle2 to ensure full render
    await page.goto('https://binge.buzz/login', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Optional extra wait
    await page.waitForTimeout(2000);

    // Select Bangladesh country if selector exists
    try {
      await page.waitForSelector('select.PhoneInputCountrySelect', { visible: true, timeout: 15000 });
      await page.select('select.PhoneInputCountrySelect', 'BD');
    } catch {
      console.warn('⚠️ Country selector not found (maybe defaulted to BD)');
    }

    // Wait for and type phone number
    await page.waitForSelector('input.PhoneInputInput', { visible: true, timeout: 30000 });
    const input = await page.$('input.PhoneInputInput');
    await input.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('input.PhoneInputInput', phoneNumber, { delay: 80 });

    // Confirm value entered
    const entered = await page.$eval('input.PhoneInputInput', el => el.value);
    console.log('✅ Phone entered:', entered);

    // Click "Generate OTP" or fallback to any visible button
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

    if (!clicked) throw new Error('❌ No OTP/Verify button found');

    // Wait for server response or visual confirmation
    await page.waitForTimeout(7000);

    // Screenshot after OTP request
    const fileName = `otp_screenshot_${Date.now()}.png`;
    const filePath = path.join(__dirname, 'public', fileName);
    await page.screenshot({ path: filePath, fullPage: true });

    const protocol = USE_HTTPS ? 'https' : 'http';
    const screenshotUrl = `${protocol}://localhost:${PORT}/${fileName}`;

    console.log(`🖼️ Screenshot saved: ${screenshotUrl}`);

    res.json({
      message: '✅ OTP process completed',
      screenshotUrl,
    });

  } catch (error) {
    console.error('❌ Automation failed:', error);

    if (browser) {
      try {
        const page = (await browser.pages())[0];
        const errorFile = `error_screenshot_${Date.now()}.png`;
        const errorPath = path.join(__dirname, 'public', errorFile);
        await page.screenshot({ path: errorPath, fullPage: true });
        const protocol = USE_HTTPS ? 'https' : 'http';
        const errorUrl = `${protocol}://localhost:${PORT}/${errorFile}`;
        console.log(`❗ Error screenshot: ${errorUrl}`);
      } catch (errCap) {
        console.warn('⚠️ Screenshot failed:', errCap.message);
      }
    }

    res.status(500).json({ error: 'Automation failed', details: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
