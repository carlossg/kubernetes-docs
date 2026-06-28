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
  aiTitle.innerHTML = '✨ AI Answer';
  
  const aiText = document.createElement('div');
  aiText.className = 'ai-text';
  
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  
  aiAnswer.append(aiTitle, aiText, cursor);

  const citationsList = document.createElement('ul');
  citationsList.className = 'citations-list hidden';

  container.append(aiAnswer, citationsList);

  return { container, aiAnswer, aiText, cursor, citationsList };
}

function renderCitations(citations, container) {
  container.innerHTML = '';
  if (!citations || citations.length === 0) {
    container.classList.add('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  citations.forEach((cit) => {
    const li = document.createElement('li');
    li.className = 'citation-card';
    
    const a = document.createElement('a');
    a.href = cit.url;
    a.target = '_blank';
    a.textContent = cit.title || cit.url;
    
    const p = document.createElement('p');
    p.textContent = cit.snippet || '';
    
    li.append(a, p);
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
    const listMatch = line.match(/^[\*\-]\s+(.*)$/);
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
  const { aiAnswer, aiText, cursor, citationsList } = elements;
  
  aiAnswer.classList.remove('hidden');
  citationsList.classList.add('hidden');
  aiText.textContent = '';
  cursor.style.display = 'inline-block';

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
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      // We expect the backend to stream NDJSON (Newline Delimited JSON)
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.type === 'text') {
            accumulatedText += data.content;
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
