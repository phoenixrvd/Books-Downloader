const config = require('./config');

const puppeteer = require('puppeteer');
const devices = require( "puppeteer/DeviceDescriptors" );
const fse = require('fs-extra');
const path = require('path');

(async () => {

    async function storeCache(file_name) {

        let browser = await puppeteer.launch();
        let page = await browser.newPage();

        if('mobile.html' === file_name) {
            await page.emulate( devices[ "iPhone X" ] );
        }

        await page.goto(config.TEST_PAGE_URL);

        // Remove JSS and CSS (cleanup)
        await page.evaluate(() => {
            return window.$('script, style, link').remove();
        });

        // Store page to file
        let content_path = await path.resolve(`${config.TEST_PATH_CACHE}/${file_name}`);
        let html = await page.content();
        fse.outputFile(content_path, html);

        browser.close();
    }

    await storeCache('desktop.html');
    await storeCache('mobile.html');

})();