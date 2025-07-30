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
  let browser;
  try {
    let phoneNumber = req.body.phoneNumber;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Missing phone number' });
    }

    // Clean phone number to digits only
    phoneNumber = phoneNumber.replace(/\D/g, '');
    if (!/^\d{10,}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    console.log(`➡️ Starting OTP automation for: ${phoneNumber}`);

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

    // Wait for country code selector and set country
    await page.waitForSelector('select.PhoneInputCountrySelect', { visible: true, timeout: 30000 });
    // Choose Bangladesh as example (change if needed)
    await page.select('select.PhoneInputCountrySelect', 'BD');

    // Wait for phone input
    await page.waitForSelector('input.PhoneInputInput', { visible: true, timeout: 30000 });
    const input = await page.$('input.PhoneInputInput');
    await input.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('input.PhoneInputInput', phoneNumber, { delay: 100 }); // slow typing

    const entered = await page.$eval('input.PhoneInputInput', el => el.value);
    console.log('✅ Entered phone number:', entered);

    // Wait for "Generate OTP" button by text and click it
    await page.waitForFunction(() => {
      return [...document.querySelectorAll('button.BingeBtnBase-root')].some(btn => btn.textContent.includes('Generate OTP'));
    }, { timeout: 20000 });

    const buttons = await page.$$('button.BingeBtnBase-root');
    let clicked = false;
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.includes('Generate OTP')) {
        await btn.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      throw new Error('Generate OTP button not found');
    }

    // Wait for confirmation or some indication OTP was sent (adjust if you know selector)
    await page.waitForTimeout(7000);

    // Save screenshot to public folder
    const screenshotName = `otp_screenshot_${Date.now()}.png`;
    const screenshotPath = path.join(__dirname, 'public', screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Construct screenshot URL with https (change to http if you don't have https)
    const screenshotUrl = `https://localhost:${PORT}/${screenshotName}`;

    console.log(`🖼️ Screenshot saved: ${screenshotUrl}`);

    res.json({
      message: '✅ OTP generated successfully!',
      screenshotUrl,
    });
  } catch (error) {
    console.error('❌ Automation error:', error);

    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          const errorScreenshotName = `error_screenshot_${Date.now()}.png`;
          const errorScreenshotPath = path.join(__dirname, 'public', errorScreenshotName);
          await pages[0].screenshot({ path: errorScreenshotPath, fullPage: true });
          const errScreenshotUrl = `https://localhost:${PORT}/${errorScreenshotName}`;
          console.log(`🖼️ Error screenshot saved: ${errScreenshotUrl}`);
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
