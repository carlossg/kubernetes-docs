const { chromium } = require('playwright');

async function checkHTML() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const url = 'https://main--kubernetes-docs--carlossg.aem.page/?q=how%20do%20I%20use%20vpa';
  
  console.log(`Loading ${url}...`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  
  console.log('Waiting for columns...');
  const cCol = await page.waitForSelector('.cerebras-col .ai-text', { timeout: 20000 });
  const gCol = await page.waitForSelector('.gemini-col .ai-text', { timeout: 20000 });
  await page.waitForTimeout(6000); // Allow both streams to settle
  
  const cTitle = await page.$eval('.cerebras-col .ai-title span', el => el.innerText).catch(() => 'No title');
  const gTitle = await page.$eval('.gemini-col .ai-title span', el => el.innerText).catch(() => 'No title');
  const cBadge = await page.$eval('.cerebras-col .speed-badge', el => el.innerText).catch(() => 'No speed badge');
  const gBadge = await page.$eval('.gemini-col .speed-badge', el => el.innerText).catch(() => 'No speed badge');
  
  const cHtml = await cCol.innerHTML();
  const gHtml = await gCol.innerHTML();
  
  console.log('\n=============================================');
  console.log(`Title: ${cTitle}`);
  console.log(`Badge: ${cBadge}`);
  console.log('=============================================');
  console.log(cHtml);
  
  console.log('\n=============================================');
  console.log(`Title: ${gTitle}`);
  console.log(`Badge: ${gBadge}`);
  console.log('=============================================');
  console.log(gHtml);
  console.log('=============================================\n');
  
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
