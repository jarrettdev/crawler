const _ = require('lodash');
const db = require('./db');
const puppeteer = require('puppeteer-extra');
const url = require('url');
const { executablePath } = require('puppeteer')
const fs = require('fs');

const debug = {
  crawl: require('debug')('crawler:crawl'),
  page: require('debug')('crawler:page'),
};

function write_token_to_file(token_str) {
  fs.appendFileSync('requests.txt', token_str, function (err) {
    if (err) throw err;
    console.log('Saved!');
  });
}

const crawl = async (entry, options = {}) => {
  debug.crawl('Crawler started');
  console.log('Crawler started');
  let target = (await db.popUrl()) || { url: entry, radius: 0 };
  const { maxRadius = Infinity } = options;
  if (!target.url) {
    console.log('Nothing to crawl');
    debug.crawl('Nothing to crawl');
    return;
  }
  console.log('target.url: ', target.url);
  const entryUrl = url.parse(target.url);
  const browser = await puppeteer.launch({
    args: ['--no-sandbox'],
    executablePath: executablePath(),
  },);
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.resourceType() === 'xhr') {
      request_url = request.url();
      token_str = request_url + '\n';
      write_token_to_file(token_str);

      // we can block these requests with:
    } else {
      request.continue();
    }
  });
  console.log('Puppeteer started');
  debug.crawl('Puppeteer started');

  let count = 0;
  while (target) {
    if (target.radius >= maxRadius) {
      debug.page(`Max radius reached ${target.url} not scraped`);
    } else {
      count++;
      debug.page(`Crawling: ${target.url}`);
      await page.goto(target.url);
      debug.page(`Page loaded`);
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(
          link => link.href
        );
      });
      const outboundUrls = _.chain(links)
        .filter(link => {
          return url.parse(link).host === entryUrl.host;
        })
        .value();
      debug.page(`Scraped ${outboundUrls.length} urls`);
      await db.store({
        outboundUrls,
        radius: ++target.radius,
        url: target.url,
      });
    }
    target = await db.popUrl();
  }
  debug.crawl(`Crawler finished after crawling ${count} pages`);

  browser.close();
};

module.exports = crawl;
