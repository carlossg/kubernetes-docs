const { chromium } = require('playwright');

async function checkColors() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const url = 'https://main--kubernetes-docs--carlossg.aem.page/?q=what+are+the+updateMode+options+for+vpa';
  
  console.log(`Loading ${url}...`);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  
  console.log('Waiting for AI answer...');
  await page.waitForSelector('.ai-text', { timeout: 20000 });
  await page.waitForTimeout(6000); // Wait for stream to settle
  
  const elementDetails = await page.evaluate(() => {
    const aiText = document.querySelector('.ai-text');
    if (!aiText) return [];
    
    const results = [];
    
    // Check computed color of ai-text itself
    results.push({
      selector: '.ai-text',
      color: window.getComputedStyle(aiText).color,
      bgColor: window.getComputedStyle(aiText).backgroundColor,
      text: aiText.innerText.substring(0, 30) + '...'
    });
    
    // Check children elements
    const children = aiText.querySelectorAll('*');
    children.forEach(el => {
      results.push({
        selector: `.ai-text ${el.tagName.toLowerCase()}`,
        color: window.getComputedStyle(el).color,
        bgColor: window.getComputedStyle(el).backgroundColor,
        text: el.innerText.substring(0, 30) + '...'
      });
    });
    
    return results;
  });
  
  console.log('\n--- Computed Colors ---');
  elementDetails.forEach(detail => {
    console.log(`${detail.selector}:`);
    console.log(`  color: ${detail.color}`);
    console.log(`  backgroundColor: ${detail.bgColor}`);
    console.log(`  text snippet: "${detail.text.trim()}"`);
  });
  console.log('-----------------------\n');
  
  await browser.close();
}

checkColors();
