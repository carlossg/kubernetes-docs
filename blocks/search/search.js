import { decorateIcons } from '../../scripts/aem.js';

const BACKEND_URL = 'https://kubernetes-search-backend-642841493686.us-central1.run.app/api/search';

function createSearchBox() {
  const container = document.createElement('div');
  container.className = 'search-box';

  const inputContainer = document.createElement('div');
  inputContainer.className = 'search-input-container';

  const icon = document.createElement('span');
  icon.className = 'icon icon-search';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Ask a question about Kubernetes...';
  input.className = 'search-input';

  inputContainer.append(icon, input);
  container.append(inputContainer);

  return { container, input };
}

function createResultsContainer() {
  const container = document.createElement('div');
  container.className = 'search-results-container';

  const aiAnswer = document.createElement('div');
  aiAnswer.className = 'ai-answer hidden';
  
  const aiTitle = document.createElement('h3');
  aiTitle.className = 'ai-title';
  aiTitle.innerHTML = '<span>✨ AI Answer</span>';
  
  const aiText = document.createElement('div');
  aiText.className = 'ai-text';
  
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  
  aiAnswer.append(aiTitle, aiText, cursor);

  const citationsList = document.createElement('ul');
  citationsList.className = 'citations-list hidden';

  container.append(aiAnswer, citationsList);

  return { container, aiAnswer, aiTitle, aiText, cursor, citationsList };
}

function cleanMarkdownSnippet(text) {
  if (!text) return '';
  return text
    .replace(/```\w*/g, '')        // Remove code block ticks and language tags (e.g. ```yaml)
    .replace(/[`\*#_\-\+]/g, '')   // Remove markdown symbols (ticks, asterisks, hashes, bullet indicators)
    .replace(/\s+/g, ' ')          // Flatten newlines and multiple spaces into single spaces
    .trim();
}

function renderCitations(citations, container) {
  container.innerHTML = '';
  if (!citations || citations.length === 0) {
    container.classList.add('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  
  // Group citations by URL to avoid duplicate cards
  const grouped = {};
  citations.forEach((cit) => {
    const url = cit.url;
    if (!grouped[url]) {
      grouped[url] = {
        title: cit.title || url,
        url: url,
        snippets: []
      };
    }
    const cleanSnippet = cleanMarkdownSnippet(cit.snippet);
    if (cleanSnippet && !grouped[url].snippets.includes(cleanSnippet)) {
      grouped[url].snippets.push(cleanSnippet);
    }
  });
  
  // Render consolidated cards
  Object.values(grouped).forEach((doc) => {
    const li = document.createElement('li');
    li.className = 'citation-card';
    
    const a = document.createElement('a');
    a.href = doc.url;
    a.target = '_blank';
    a.textContent = doc.title;
    
    li.append(a);
    
    const snippetsDiv = document.createElement('div');
    snippetsDiv.className = 'citation-snippets';
    
    // Show up to 2 unique snippets per source to keep the card compact
    doc.snippets.slice(0, 2).forEach((snippet) => {
      const p = document.createElement('p');
      p.className = 'citation-snippet';
      p.textContent = snippet;
      snippetsDiv.append(p);
    });
    
    li.append(snippetsDiv);
    container.append(li);
  });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseMarkdown(text) {
  // If there's an unclosed code block, temporarily close it for parsing during stream
  let textToParse = text;
  const backticksCount = (text.match(/```/g) || []).length;
  if (backticksCount % 2 !== 0) {
    textToParse += '\n```';
  }

  let html = textToParse;

  // 1. Code blocks (extract and place in placeholders first to avoid parsing markup inside them)
  const codeBlocks = [];
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_PLACEHOLDER_${codeBlocks.length}__`;
    codeBlocks.push(`<pre><code class="language-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`);
    return placeholder;
  });

  // 2. Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 3. Headings
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

  // 4. Bullet lists
  const lines = html.split('\n');
  let inList = false;
  const processedLines = lines.map(line => {
    const listMatch = line.match(/^\s*[\*\-]\s+(.*)$/);
    if (listMatch) {
      let content = listMatch[1];
      // Inline formatting for list items
      content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      if (!inList) {
        inList = true;
        return '<ul><li>' + content + '</li>';
      }
      return '<li>' + content + '</li>';
    } else {
      if (inList && line.trim() !== '') {
        inList = false;
        return '</ul>' + line;
      }
      return line;
    }
  });
  if (inList) processedLines.push('</ul>');
  html = processedLines.join('\n');

  // 5. Bold & Italic (outside lists/code)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 6. Paragraphs (split by double newlines)
  html = html.split(/\n\n+/).map(para => {
    para = para.trim();
    if (!para) return '';
    if (para.startsWith('<h') || para.startsWith('<pre') || para.startsWith('<ul') || para.startsWith('<li>') || para.startsWith('</ul')) {
      return para;
    }
    return `<p>${para.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  // Restore code blocks
  codeBlocks.forEach((blockHtml, index) => {
    html = html.replace(`__CODE_BLOCK_PLACEHOLDER_${index}__`, blockHtml);
  });

  return html;
}

async function handleSearch(query, elements) {
  const { aiAnswer, aiTitle, aiText, cursor, citationsList } = elements;
  
  aiAnswer.classList.remove('hidden');
  citationsList.classList.add('hidden');
  aiText.textContent = '';
  cursor.style.display = 'inline-block';

  // Clear previous speed badge
  const existingBadge = aiTitle.querySelector('.speed-badge');
  if (existingBadge) existingBadge.remove();

  // Update the URL query parameter
  const url = new URL(window.location.href);
  url.searchParams.set('q', query);
  window.history.replaceState({}, '', url.toString());

  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';
    let startTime = null;
    let charCount = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.type === 'text') {
            if (startTime === null) {
              startTime = Date.now();
            }
            accumulatedText += data.content;
            charCount += data.content.length;
            
            // Speed calculation (1 token ≈ 4 characters)
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 0.1) {
              const estimatedTokens = Math.round(charCount / 4);
              const tps = Math.round(estimatedTokens / elapsed);
              
              let badge = aiTitle.querySelector('.speed-badge');
              if (!badge) {
                badge = document.createElement('span');
                badge.className = 'speed-badge';
                aiTitle.append(badge);
              }
              badge.innerHTML = `⚡ ${tps.toLocaleString()} tok/s via Cerebras`;
            }
            
            aiText.innerHTML = parseMarkdown(accumulatedText);
          } else if (data.type === 'citations') {
            renderCitations(data.citations, citationsList);
          }
        } catch (e) {
          console.error('Error parsing stream chunk', e, line);
        }
      }
    }
  } catch (error) {
    console.error('Search failed:', error);
    aiText.innerHTML = '<span class="search-error">Sorry, an error occurred while searching. Please try again later.</span>';
  } finally {
    cursor.style.display = 'none';
  }
}

export default async function decorate(block) {
  block.innerHTML = ''; // Clear default block content

  const { container: searchBox, input } = createSearchBox();
  const results = createResultsContainer();

  block.append(searchBox, results.container);
  
  // AEM EDS icon decoration
  decorateIcons(block);

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = input.value.trim();
      if (query.length > 2) {
        handleSearch(query, results);
      }
    }
  });

  // Check URL parameters on load
  const searchParams = new URLSearchParams(window.location.search);
  const initialQuery = searchParams.get('q');
  if (initialQuery) {
    input.value = initialQuery;
    handleSearch(initialQuery, results);
  }
}
