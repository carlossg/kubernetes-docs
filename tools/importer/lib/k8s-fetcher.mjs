import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLONE_DIR = join(__dirname, '..', 'kubernetes-website');
const CONTENT_ROOT = join(CLONE_DIR, 'content', 'en', 'docs');
const REPO_URL = 'https://github.com/kubernetes/website.git';

/**
 * Shallow-clone the kubernetes/website repo if not already present.
 */
export function cloneRepo() {
  if (existsSync(CLONE_DIR)) {
    console.log('Kubernetes website repo already cloned, skipping.');
    return;
  }
  console.log('Cloning kubernetes/website (shallow)...');
  execSync(
    `git clone --depth 1 --filter=blob:none --sparse "${REPO_URL}" "${CLONE_DIR}"`,
    { stdio: 'inherit' },
  );
  execSync('git sparse-checkout set content/en/docs', {
    cwd: CLONE_DIR,
    stdio: 'inherit',
  });
  console.log('Clone complete.');
}

/**
 * Recursively walk a directory and collect all .md files.
 */
async function walkDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkDir(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Map a filesystem path to a URL path.
 * content/en/docs/concepts/_index.md → docs/concepts
 * content/en/docs/concepts/foo.md → docs/concepts/foo
 */
function toUrlPath(filePath) {
  let rel = relative(join(CLONE_DIR, 'content', 'en'), filePath);
  // Remove .md extension
  rel = rel.replace(/\.md$/, '');
  // _index files map to the directory itself
  rel = rel.replace(/\/_index$/, '');
  return rel;
}

/**
 * Enumerate all markdown files and return { absolutePath, urlPath } pairs.
 * @param {string} [section] - Optional section name to filter (e.g. 'concepts')
 */
export async function enumerateFiles(section) {
  const root = section ? join(CONTENT_ROOT, section) : CONTENT_ROOT;
  if (!existsSync(root)) {
    throw new Error(`Content directory not found: ${root}`);
  }
  const allFiles = await walkDir(root);
  return allFiles.map((f) => ({
    absolutePath: f,
    urlPath: toUrlPath(f),
  }));
}

export { CLONE_DIR, CONTENT_ROOT };
