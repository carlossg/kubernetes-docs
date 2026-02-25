const DA_ADMIN_URL = 'https://admin.da.live/source';
const ORG = 'carlossg';
const REPO = 'kubernetes-docs';
const MAX_CONCURRENCY = 5;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Upload a single HTML file to da.live.
 * @param {string} path - URL path (e.g. 'docs/concepts')
 * @param {string} html - HTML content
 * @param {string} token - DA auth token
 * @param {boolean} dryRun - If true, skip actual upload
 */
async function uploadOne(path, html, token, dryRun = false) {
  const url = `${DA_ADMIN_URL}/${ORG}/${REPO}/${path}.html`;

  if (dryRun) {
    console.log(`  [DRY RUN] Would upload: ${url} (${html.length} bytes)`);
    return { path, status: 'dry-run' };
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const blob = new Blob([html], { type: 'text/html' });
      const formData = new FormData();
      formData.append('data', blob, `${path.split('/').pop() || 'index'}.html`);

      const resp = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (resp.ok) {
        return { path, status: 'ok', statusCode: resp.status };
      }

      if (resp.status === 429 || resp.status >= 500) {
        const delay = RETRY_DELAY_MS * attempt;
        console.warn(`  Retry ${attempt}/${MAX_RETRIES} for ${path} (HTTP ${resp.status}), waiting ${delay}ms...`);
        await sleep(delay);
      } else {
        const body = await resp.text();
        return { path, status: 'error', statusCode: resp.status, body };
      }
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.warn(`  Retry ${attempt}/${MAX_RETRIES} for ${path} (${err.message})`);
        await sleep(RETRY_DELAY_MS * attempt);
      } else {
        return { path, status: 'error', error: err.message };
      }
    }
  }
  return { path, status: 'error', error: 'max retries exceeded' };
}

/**
 * Upload multiple pages with concurrency control.
 * @param {{ path: string, html: string }[]} pages
 * @param {string} token
 * @param {boolean} dryRun
 */
export async function uploadAll(pages, token, dryRun = false) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < pages.length) {
      const i = idx;
      idx += 1;
      const { path, html } = pages[i];
      console.log(`  [${i + 1}/${pages.length}] Uploading ${path}...`);
      const result = await uploadOne(path, html, token, dryRun);
      results.push(result);
      if (result.status === 'error') {
        console.error(`  FAILED: ${path} → ${result.statusCode || result.error}`);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENCY, pages.length) },
    () => worker(),
  );
  await Promise.all(workers);

  const ok = results.filter((r) => r.status === 'ok' || r.status === 'dry-run').length;
  const failed = results.filter((r) => r.status === 'error').length;
  console.log(`\nUpload complete: ${ok} succeeded, ${failed} failed out of ${results.length} total.`);

  return results;
}
