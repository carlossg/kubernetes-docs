#!/usr/bin/env node

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const TOKEN = process.env.DA_TOKEN;
const SRC_ORG = process.argv[2] || 'paolomoz';
const SRC_REPO = process.argv[3] || 'arco';
const DST_ORG = process.argv[4] || 'carlossg';
const DST_REPO = process.argv[5] || 'arco';
const CONCURRENCY = 5;

if (!TOKEN) {
  console.error('DA_TOKEN is required in .env');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}` };

async function listDir(org, repo, path = '') {
  const url = `https://admin.da.live/list/${org}/${repo}${path}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    console.warn(`  List failed: ${url} → ${resp.status}`);
    return [];
  }
  return resp.json();
}

async function listAll(org, repo, path = '') {
  const entries = await listDir(org, repo, path);
  const files = [];
  const dirs = [];

  for (const entry of entries) {
    if (entry.ext) {
      files.push(entry);
    } else {
      dirs.push(entry);
    }
  }

  for (const dir of dirs) {
    const subPath = dir.path.replace(`/${org}/${repo}`, '');
    const subFiles = await listAll(org, repo, subPath);
    files.push(...subFiles);
  }

  return files;
}

async function fetchFile(org, repo, filePath) {
  const url = `https://admin.da.live/source/${org}/${repo}${filePath}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    console.warn(`  Fetch failed: ${url} → ${resp.status}`);
    return null;
  }
  return resp.blob();
}

async function uploadFile(org, repo, filePath, blob, name) {
  const url = `https://admin.da.live/source/${org}/${repo}${filePath}`;
  const formData = new FormData();
  formData.append('data', blob, name);

  const resp = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: formData,
  });

  return { status: resp.status, ok: resp.ok };
}

async function main() {
  console.log(`Copying content from ${SRC_ORG}/${SRC_REPO} to ${DST_ORG}/${DST_REPO}`);
  console.log();

  console.log('Listing all files...');
  const files = await listAll(SRC_ORG, SRC_REPO);
  console.log(`Found ${files.length} files.`);
  console.log();

  let idx = 0;
  let ok = 0;
  let failed = 0;

  async function worker() {
    while (idx < files.length) {
      const i = idx;
      idx += 1;
      const entry = files[i];
      const filePath = entry.path.replace(`/${SRC_ORG}/${SRC_REPO}`, '');
      const name = `${entry.name}.${entry.ext}`;

      console.log(`  [${i + 1}/${files.length}] ${filePath}`);
      const blob = await fetchFile(SRC_ORG, SRC_REPO, filePath);
      if (!blob) {
        failed += 1;
        continue;
      }

      const result = await uploadFile(DST_ORG, DST_REPO, filePath, blob, name);
      if (result.ok) {
        ok += 1;
      } else {
        console.warn(`    Upload failed: ${result.status}`);
        failed += 1;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, files.length) },
    () => worker(),
  );
  await Promise.all(workers);

  console.log();
  console.log(`Done: ${ok} copied, ${failed} failed out of ${files.length} total.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
