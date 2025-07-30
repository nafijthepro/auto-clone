const express = require('express');
const puppeteer = require('puppeteer'); // or use 'puppeteer-core' if you skip downloading Chromium
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static HTML
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
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            // Optional if using puppeteer-core:
            // executablePath: '/usr/bin/chromium-browser'
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

        await page.waitForTimeout(3000); // Wait for OTP to be triggered

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

