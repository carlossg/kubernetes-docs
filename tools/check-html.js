const { chromium } = require('playwright');

async function checkHTML() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const url = 'https://main--kubernetes-docs--carlossg.aem.page/?q=how%20do%20I%20use%20vpa';
  
  console.log(`Loading ${url}...`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  
  console.log('Waiting for AI answer...');
  const aiAnswer = await page.waitForSelector('.ai-text', { timeout: 20000 });
  await page.waitForTimeout(6000); // Allow stream to settle
  
  const html = await aiAnswer.innerHTML();
  console.log('\n--- DOM HTML Output ---');
  console.log(html);
  console.log('-----------------------\n');
  
  const citations = await page.$('.citations-list');
  if (citations) {
    const citationsHtml = await citations.innerHTML();
    console.log('--- Citations HTML Output ---');
    console.log(citationsHtml);
    console.log('-----------------------------\n');
  }
  
  await browser.close();
}

checkHTML();
