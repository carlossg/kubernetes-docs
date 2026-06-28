const { chromium } = require('playwright');

async function pollSearch() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const url = 'https://main--kubernetes-docs--carlossg.aem.page/?q=how%20do%20I%20use%20vpa';
  const maxAttempts = 15;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\nAttempt ${attempt}/${maxAttempts}: Loading ${url}...`);
    try {
      // Reload and ignore cache
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      
      console.log('Waiting for AI answer text to stream...');
      const aiAnswer = await page.waitForSelector('.ai-text', { timeout: 20000 });
      
      // Wait for streaming to finish
      await page.waitForTimeout(6000);
      
      const text = await aiAnswer.innerText();
      console.log('AI Answer:\n', text);
      
      if (text && text.trim().length > 15 && !text.includes("I don't know") && !text.includes("error occurred") && !text.includes("generating the answer")) {
        console.log('\n======================================');
        console.log('SUCCESS: Meaningful VPA response detected!');
        console.log('======================================\n');
        
        // Print citations
        const citations = await page.$$('.citation-card');
        console.log(`Found ${citations.length} citation cards.`);
        for (let i = 0; i < citations.length; i++) {
          const title = await citations[i].$eval('a', el => el.innerText);
          const href = await citations[i].$eval('a', el => el.href);
          console.log(`Citation [${i+1}]: ${title} (${href})`);
        }
        
        await browser.close();
        process.exit(0);
      }
    } catch (e) {
      console.warn(`Attempt ${attempt} failed with error:`, e.message);
    }
    
    if (attempt < maxAttempts) {
      console.log('Waiting 10 seconds before next attempt for AEM Code Sync and caching to update...');
      await page.waitForTimeout(10000);
    }
  }
  
  console.error('FAILED: Did not receive a meaningful answer after maximum attempts.');
  await browser.close();
  process.exit(1);
}

pollSearch();
