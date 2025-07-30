const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Dynamically find Chrome executable installed by Puppeteer
function getChromePath() {
  const basePath = '/opt/render/.cache/puppeteer/chrome/linux';
  if (!fs.existsSync(basePath)) {
    throw new Error(`Puppeteer chrome cache folder not found: ${basePath}`);
  }
  
  // Read all version folders, e.g., ['127.0.6533.88', '131.0.6778.204', ...]
  const versions = fs.readdirSync(basePath).filter(name => /^\d+\./.test(name));
  if (versions.length === 0) {
    throw new Error('No Chrome versions found in Puppeteer cache folder.');
  }

  // Sort and pick the latest version (lexical sort works here)
  const latestVersion = versions.sort().pop();

  // Construct full path to Chrome executable
  const chromePath = path.join(basePath, latestVersion, 'chrome-linux64', 'chrome');
  
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome executable not found at: ${chromePath}`);
  }

  return chromePath;
}

app.post('/start', async (req, res) => {
  const phoneNumber = req.body.phoneNumber;
  if (!phoneNumber || !/^\d{10,}$/.test(phoneNumber)) {
    return res.status(400).send('Invalid or missing phone number');
  }

  console.log(`➡️ Starting OTP automation for: ${phoneNumber}`);

  let browser;
  try {
    const chromePath = getChromePath();

    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
