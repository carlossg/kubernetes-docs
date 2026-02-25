import { marked } from 'marked';

// Configure marked for GitHub-flavored markdown
marked.use({ gfm: true, breaks: false });

/**
 * Build the AEM metadata table as HTML.
 */
function buildMetadataTable(frontmatter) {
  const rows = [];
  if (frontmatter.title) {
    rows.push(`<tr><td>title</td><td>${frontmatter.title}</td></tr>`);
  }
  if (frontmatter.description) {
    rows.push(`<tr><td>description</td><td>${frontmatter.description}</td></tr>`);
  }
  if (frontmatter.content_type) {
    rows.push(`<tr><td>content-type</td><td>${frontmatter.content_type}</td></tr>`);
  }
  if (frontmatter.weight !== undefined) {
    rows.push(`<tr><td>weight</td><td>${frontmatter.weight}</td></tr>`);
  }
  if (rows.length === 0) return '';
  return `<div>
<table>
  <tr><td colspan="2">metadata</td></tr>
  ${rows.join('\n  ')}
</table>
</div>`;
}

/**
 * Convert cleaned markdown + frontmatter to AEM-compatible HTML.
 * @param {{ frontmatter: object, body: string }} parsed
 * @returns {string} Full HTML document
 */
export function convertToHtml({ frontmatter, body }) {
  const title = frontmatter.title || 'Untitled';
  const htmlBody = marked.parse(body);
  const metadataTable = buildMetadataTable(frontmatter);

  return `<html>
<body>
  <header></header>
  <main>
    <div>
      <h1>${title}</h1>
      ${htmlBody}
    </div>
    ${metadataTable}
  </main>
  <footer></footer>
</body>
</html>`;
}

/**
 * Generate a simple navigation page.
 */
export function generateNavHtml() {
  return `<html>
<body>
  <header></header>
  <main>
    <div>
      <ul>
        <li><a href="/docs">Kubernetes Documentation</a></li>
        <li><a href="/docs/concepts">Concepts</a></li>
        <li><a href="/docs/tasks">Tasks</a></li>
        <li><a href="/docs/tutorials">Tutorials</a></li>
        <li><a href="/docs/reference">Reference</a></li>
        <li><a href="/docs/setup">Setup</a></li>
        <li><a href="/docs/contribute">Contribute</a></li>
      </ul>
    </div>
  </main>
  <footer></footer>
</body>
</html>`;
}

/**
 * Generate a simple footer page.
 */
export function generateFooterHtml() {
  return `<html>
<body>
  <header></header>
  <main>
    <div>
      <p>Kubernetes documentation imported from <a href="https://kubernetes.io/docs/">kubernetes.io</a>.</p>
      <p>Content licensed under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.</p>
    </div>
  </main>
  <footer></footer>
</body>
</html>`;
}

/**
 * Generate a homepage with links to doc sections.
 */
export function generateIndexHtml() {
  return `<html>
<body>
  <header></header>
  <main>
    <div>
      <h1>Kubernetes Documentation</h1>
      <p>Welcome to the Kubernetes documentation. Use the links below to explore.</p>
      <ul>
        <li><a href="/docs/concepts">Concepts</a> - Learn about the core concepts of Kubernetes</li>
        <li><a href="/docs/tasks">Tasks</a> - Step-by-step guides for common tasks</li>
        <li><a href="/docs/tutorials">Tutorials</a> - Hands-on tutorials to learn Kubernetes</li>
        <li><a href="/docs/reference">Reference</a> - API and CLI reference documentation</li>
        <li><a href="/docs/setup">Setup</a> - Installation and setup guides</li>
        <li><a href="/docs/contribute">Contribute</a> - How to contribute to Kubernetes documentation</li>
      </ul>
    </div>
  </main>
  <footer></footer>
</body>
</html>`;
}
