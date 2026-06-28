const { chromium } = require('playwright');

async function checkHomepage() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const url = 'https://main--kubernetes-docs--carlossg.aem.page/';
  
  console.log(`Loading ${url}...`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  
  console.log('Checking for docs-home-grid...');
  const grid = await page.waitForSelector('.docs-home-grid', { timeout: 15000 });
  
  const cards = await page.$$('.docs-home-card');
  console.log(`Found ${cards.length} category cards:\n`);
  
  for (let i = 0; i < cards.length; i++) {
    const title = await cards[i].$eval('.card-title', el => el.innerText);
    const desc = await cards[i].$eval('.card-desc', el => el.innerText);
    const href = await cards[i].$eval('.card-title', el => el.getAttribute('href'));
    console.log(`  [Card ${i+1}] ${title}: "${desc}" (href: ${href})`);
  }
  
  await browser.close();
}

checkHomepage();
