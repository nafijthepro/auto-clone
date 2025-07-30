const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// POST route to trigger Puppeteer automation
app.post('/start', async (req, res) => {
    const phoneNumber = req.body.phoneNumber;
    if (!phoneNumber) return res.status(400).send('Phone number required');

    try {
        const browser = await puppeteer.launch({
            headless: true,
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
        console.log('Entered phone number:', entered);

        await page.waitForSelector('.BingeBtnBase-root', { visible: true });
        await page.click('.BingeBtnBase-root');

        await page.waitForTimeout(3000);
        await browser.close();

        res.send('OTP generated successfully!');
    } catch (error) {
        console.error('Automation failed:', error);
        res.status(500).send('Automation failed');
    }
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
