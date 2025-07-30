const path = require('path');
const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

const PORT = process.env.PORT || 3000;

// Absolute path to Chrome installed during postinstall
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
  const phoneNumber = req.body.phoneNumber;
  if (!phoneNumber || !/^\d{10,}$/.test(phoneNumber)) {
    return res.status(400).send('Invalid or missing phone number');
  }

  console.log(`➡️ Starting OTP automation for: ${phoneNumber}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    try {
      await page.goto('https://binge.buzz/login', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
    } catch (e) {
      console.warn('⚠️ First page load failed, retrying...');
      await page.goto('https://binge.buzz/login', { waitUntil: 'load', timeout: 60000 });
    }

    // Wait for phone input by class, exactly as given
    await page.waitForSelector('input.PhoneInputInput', { visible: true });
    const input = await page.$('input.PhoneInputInput');
    await input.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('input.PhoneInputInput', phoneNumber);

    const entered = await page.$eval('input.PhoneInputInput', el => el.value);
    console.log('✅ Entered phone number:', entered);

    // Wait and click the verify button by exact class (note it has two classes, so select the main one)
    await page.waitForSelector('button.BingeBtnBase-root', { visible: true });
    await page.click('button.BingeBtnBase-root');

    // Wait for any potential result/loading
    await page.waitForTimeout(3000);

    // Take screenshot after clicking Verify
    const screenshotPath = path.join(__dirname, 'public', `otp_screenshot_${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`🖼️ Screenshot saved: http://localhost:${PORT}/${path.basename(screenshotPath)}`);

    res.send('✅ OTP generated successfully!');
  } catch (error) {
    console.error('❌ Automation error:', error.message);
    res.status(500).send('Server error during OTP automation');
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
