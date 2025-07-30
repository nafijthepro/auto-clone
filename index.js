const fs = require('fs');
const path = require('path');
const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

// Function to find the Chrome executable path dynamically
function getChromeExecutablePath() {
  const basePath = '/opt/render/.cache/puppeteer/chrome';
  if (!fs.existsSync(basePath)) {
    throw new Error(`Chrome cache folder does not exist: ${basePath}`);
  }

  const linuxFolders = fs.readdirSync(basePath).filter(folder => folder.startsWith('linux-'));
  if (linuxFolders.length === 0) {
    throw new Error('No linux- version folder found in Puppeteer chrome cache.');
  }

  // Sort folders alphabetically and pick the last (latest) one
  const latestLinuxFolder = linuxFolders.sort().pop();

  const chromePath = path.join(basePath, latestLinuxFolder, 'chrome-linux64', 'chrome');

  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome executable not found at: ${chromePath}`);
  }

  return chromePath;
}

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
    const chromePath = getChromeExecutablePath();

    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://binge.buzz/login', { waitUntil: 'networkidle0' });

    await page.waitForSelector('.PhoneInputInput', { visible: true });
    const input = await page.$('.PhoneInputInput');
    await input.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('.PhoneInputInput', phoneNumber);

    const entered = await page.$eval('.PhoneInputInput', el => el.value);
    console.log('✅ Entered:', entered);

    await page.waitForSelector('.BingeBtnBase-root', { visible: true });
    await page.click('.BingeBtnBase-root');
    await page.waitForTimeout(3000);

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
