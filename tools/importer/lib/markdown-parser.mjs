import matter from 'gray-matter';

const K8S_VERSION = '1.32';

/**
 * Strip Hugo shortcodes and convert to plain markdown equivalents.
 */
function stripShortcodes(content) {
  let out = content;

  // Remove HTML comments (<!-- overview -->, <!-- body -->, etc.)
  out = out.replace(/<!--\s*\w+\s*-->/g, '');

  // {{< glossary_tooltip text="..." term_id="..." >}} → just the text
  out = out.replace(
    /\{\{<\s*glossary_tooltip\s+text="([^"]*)"[^>]*>\}\}/g,
    '$1',
  );
  // Also handle with term_id first
  out = out.replace(
    /\{\{<\s*glossary_tooltip\s+term_id="[^"]*"\s+text="([^"]*)"[^>]*>\}\}/g,
    '$1',
  );

  // {{< glossary_definition term_id="..." length="..." >}} → placeholder
  out = out.replace(
    /\{\{<\s*glossary_definition\s+[^>]*>\}\}/g,
    '',
  );

  // {{< feature-state ... >}} → bold inline text
  out = out.replace(
    /\{\{<\s*feature-state\s+.*?state="(\w+)"[^>]*>\}\}/g,
    '**FEATURE STATE: $1**',
  );
  out = out.replace(
    /\{\{<\s*feature-state\s*>\}\}/g,
    '**FEATURE STATE: stable**',
  );

  // {{< note >}} ... {{< /note >}} → blockquote with bold prefix
  out = out.replace(
    /\{\{<\s*note\s*>\}\}\s*([\s\S]*?)\s*\{\{<\s*\/note\s*>\}\}/g,
    (_m, body) => `> **Note:** ${body.trim().replace(/\n/g, '\n> ')}\n`,
  );

  // {{< warning >}} ... {{< /warning >}}
  out = out.replace(
    /\{\{<\s*warning\s*>\}\}\s*([\s\S]*?)\s*\{\{<\s*\/warning\s*>\}\}/g,
    (_m, body) => `> **Warning:** ${body.trim().replace(/\n/g, '\n> ')}\n`,
  );

  // {{< caution >}} ... {{< /caution >}}
  out = out.replace(
    /\{\{<\s*caution\s*>\}\}\s*([\s\S]*?)\s*\{\{<\s*\/caution\s*>\}\}/g,
    (_m, body) => `> **Caution:** ${body.trim().replace(/\n/g, '\n> ')}\n`,
  );

  // {{< heading "whatsnext" >}} → ## What's next
  out = out.replace(
    /\{\{<\s*heading\s+"whatsnext"\s*>\}\}/g,
    "## What's next",
  );

  // {{< tabs name="..." >}} ... {{< /tabs >}} — strip wrapper, keep content
  out = out.replace(/\{\{<\s*tabs\s+[^>]*>\}\}/g, '');
  out = out.replace(/\{\{<\s*\/tabs\s*>\}\}/g, '');

  // {{< tab name="..." ... >}} ... {{< /tab >}}
  out = out.replace(
    /\{\{<\s*tab\s+name="([^"]*)"[^>]*>\}\}/g,
    '**$1**\n',
  );
  out = out.replace(/\{\{<\s*\/tab\s*>\}\}/g, '');

  // {{< figure src="..." alt="..." caption="..." >}}
  out = out.replace(
    /\{\{<\s*figure\s+src="([^"]*)"(?:\s+alt="([^"]*)")?(?:\s+caption="([^"]*)")?[^>]*>\}\}/g,
    (_m, src, alt, caption) => {
      const imgSrc = src.startsWith('/') ? `https://kubernetes.io${src}` : src;
      const altText = alt || caption || 'figure';
      return `![${altText}](${imgSrc})`;
    },
  );

  // {{< codenew file="..." >}} or {{< code_sample file="..." >}}
  out = out.replace(
    /\{\{<\s*(?:codenew|code_sample)\s+file="([^"]*)"[^>]*>\}\}/g,
    (_m, file) => `[View code sample: ${file}](https://github.com/kubernetes/website/blob/main/content/en/examples/${file})`,
  );

  // {{< mermaid >}} ... {{< /mermaid >}}
  out = out.replace(
    /\{\{<\s*mermaid\s*>\}\}\s*([\s\S]*?)\s*\{\{<\s*\/mermaid\s*>\}\}/g,
    '```\n[Mermaid diagram - view on kubernetes.io for rendering]\n```',
  );

  // {{< param "version" >}} and {{< skew ... >}}
  out = out.replace(/\{\{<\s*param\s+"version"\s*>\}\}/g, K8S_VERSION);
  out = out.replace(
    /\{\{<\s*skew\s+[^>]*>\}\}/g,
    K8S_VERSION,
  );
  // {{< latest-version >}}
  out = out.replace(/\{\{<\s*latest-version\s*>\}\}/g, K8S_VERSION);

  // {{< api-reference ... >}} → plain text
  out = out.replace(
    /\{\{<\s*api-reference\s+.*?page="([^"]*)"[^>]*>\}\}/g,
    '[API Reference: $1](/docs/reference/kubernetes-api/)',
  );

  // {{< toc >}} — remove table of contents shortcode
  out = out.replace(/\{\{<\s*toc\s*>\}\}/g, '');

  // Catch-all: remove any remaining {{< ... >}} and {{< /... >}} shortcodes
  out = out.replace(/\{\{<\s*\/?\s*[\w-]+(?:\s+[^>]*)?\s*>\}\}/g, '');

  // Also handle {{% ... %}} style shortcodes
  out = out.replace(/\{\{%\s*\/?\s*[\w-]+(?:\s+[^>]*)?\s*%\}\}/g, '');

  return out;
}

/**
 * Rewrite internal links to keep /docs/... paths.
 * Strips trailing slashes and removes anchors to Hugo sections.
 */
function rewriteLinks(content) {
  // Rewrite relative links like (../foo) or (./foo)
  // These are harder without path context, so we leave them as-is

  // Strip trailing slashes from internal /docs/ links
  return content.replace(
    /\]\((\/docs\/[^)]*?)\/(\)|#)/g,
    ']($1$2',
  );
}

/**
 * Parse a markdown file: extract frontmatter + clean the body.
 * @param {string} raw - Raw markdown file content
 * @returns {{ frontmatter: object, body: string }}
 */
export function parseMarkdown(raw) {
  const { data: frontmatter, content } = matter(raw);
  let body = stripShortcodes(content);
  body = rewriteLinks(body);
  return { frontmatter, body };
}
