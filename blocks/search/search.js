import { decorateIcons } from '../../scripts/aem.js';

const BACKEND_URL = 'http://localhost:8080/api/search'; // This should be configurable via AEM block properties

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
  aiTitle.innerHTML = '<span class="icon icon-sparkle"></span> AI Answer';
  
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

async function handleSearch(query, elements) {
  const { aiAnswer, aiText, cursor, citationsList } = elements;
  
  aiAnswer.classList.remove('hidden');
  citationsList.classList.add('hidden');
  aiText.textContent = '';
  cursor.style.display = 'inline-block';

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
            aiText.textContent += data.content;
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

  let searchTimeout;
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = input.value.trim();
      if (query.length > 2) {
        handleSearch(query, results);
      }
    }
  });
}
