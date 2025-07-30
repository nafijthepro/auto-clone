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
    return res.status(400).json({ error: 'Invalid or missing phone number' });
  }

  console.log(`➡️ Starting OTP automation for: ${phoneNumber}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 800 },
    });

    const page = await browser.newPage();

    try {
      await page.goto('https://binge.buzz/login', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
    } catch (e) {
      console.warn('⚠️ Initial page load failed, retrying with load event...');
      await page.goto('https://binge.buzz/login', {
        waitUntil: 'load',
        timeout: 60000,
      });
    }

    // Wait for phone input, max 30 seconds
    await page.waitForSelector('input.PhoneInputInput', { visible: true, timeout: 30000 });
    const input = await page.$('input.PhoneInputInput');
    await input.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('input.PhoneInputInput', phoneNumber);

    const entered = await page.$eval('input.PhoneInputInput', el => el.value);
    console.log('✅ Entered phone number:', entered);

    // Wait and click the verify button (15 seconds max)
    await page.waitForSelector('button.BingeBtnBase-root', { visible: true, timeout: 15000 });
    await page.click('button.BingeBtnBase-root');

    // Wait for any potential processing
    await page.waitForTimeout(5000);

    // Save screenshot to public folder
    const screenshotName = `otp_screenshot_${Date.now()}.png`;
    const screenshotPath = path.join(__dirname, 'public', screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const screenshotUrl = `http://localhost:${PORT}/${screenshotName}`;

    console.log(`🖼️ Screenshot saved: ${screenshotUrl}`);

    res.json({
      message: '✅ OTP generated successfully!',
      screenshotUrl,
    });
  } catch (error) {
    console.error('❌ Automation error:', error);

    // Attempt to take error screenshot for debugging
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          const errorScreenshotName = `error_screenshot_${Date.now()}.png`;
          const errorScreenshotPath = path.join(__dirname, 'public', errorScreenshotName);
          await pages[0].screenshot({ path: errorScreenshotPath, fullPage: true });
          console.log(`🖼️ Error screenshot saved: http://localhost:${PORT}/${errorScreenshotName}`);
        }
      } catch (screenshotError) {
        console.warn('⚠️ Failed to capture error screenshot:', screenshotError);
      }
    }

    res.status(500).json({ error: 'Server error during OTP automation', details: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
