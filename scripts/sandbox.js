const config = require('./config');

const puppeteer = require('puppeteer');
const devices = require( "puppeteer/DeviceDescriptors" );

(async () => {

    const browser = await puppeteer.launch({
        headless: false,
        devtools: false,
        args: [
            `--disable-extensions-except=${config.EXTENSION_PATH}`,
            `--load-extension=${config.EXTENSION_PATH}`,
        ]
    });

    const page_desktop = await browser.newPage();
    page_desktop.goto(config.TEST_PAGE_URL);

    const page_mobile = await browser.newPage();
    await page_mobile.emulate( devices[ "iPhone X" ] );
    await page_mobile.goto(config.TEST_PAGE_URL);

})();