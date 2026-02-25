#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';

import { cloneRepo, enumerateFiles } from './lib/k8s-fetcher.mjs';
import { parseMarkdown } from './lib/markdown-parser.mjs';
import {
  convertToHtml,
  generateNavHtml,
  generateFooterHtml,
  generateIndexHtml,
} from './lib/html-converter.mjs';
import { uploadAll } from './lib/da-uploader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    section: { type: 'string', default: '' },
    limit: { type: 'string', default: '0' },
  },
  strict: false,
});

const dryRun = args['dry-run'];
const section = args.section || undefined;
const limit = parseInt(args.limit, 10) || 0;
const token = process.env.DA_TOKEN;

if (!token && !dryRun) {
  console.error('Error: DA_TOKEN environment variable is required (or use --dry-run).');
  console.error('Set it in .env at the project root: DA_TOKEN=your_token_here');
  process.exit(1);
}

async function main() {
  console.log('=== Kubernetes Docs Importer ===');
  console.log(`  Dry run: ${dryRun}`);
  if (section) console.log(`  Section: ${section}`);
  if (limit) console.log(`  Limit: ${limit}`);
  console.log();

  // Step 1: Clone repo
  console.log('[1/4] Fetching Kubernetes website repository...');
  cloneRepo();
  console.log();

  // Step 2: Enumerate files
  console.log('[2/4] Enumerating markdown files...');
  let files = await enumerateFiles(section);
  console.log(`  Found ${files.length} markdown files.`);
  if (limit > 0) {
    files = files.slice(0, limit);
    console.log(`  Limited to ${files.length} files.`);
  }
  console.log();

  // Step 3: Parse and convert
  console.log('[3/4] Parsing and converting to HTML...');
  const pages = [];
  let shortcodeWarnings = 0;

  for (const file of files) {
    const raw = await readFile(file.absolutePath, 'utf-8');
    const parsed = parseMarkdown(raw);
    const html = convertToHtml(parsed);

    // Warn if any shortcodes remain
    if (html.includes('{{')) {
      shortcodeWarnings += 1;
      if (shortcodeWarnings <= 5) {
        console.warn(`  Warning: residual shortcodes in ${file.urlPath}`);
      }
    }

    pages.push({ path: file.urlPath, html });
  }

  // Add nav, footer, and index pages
  pages.push({ path: 'nav', html: generateNavHtml() });
  pages.push({ path: 'footer', html: generateFooterHtml() });
  pages.push({ path: 'index', html: generateIndexHtml() });

  if (shortcodeWarnings > 5) {
    console.warn(`  ... and ${shortcodeWarnings - 5} more files with residual shortcodes.`);
  }
  console.log(`  Converted ${pages.length} pages total (including nav/footer/index).`);
  console.log();

  // Step 4: Upload
  console.log('[4/4] Uploading to da.live...');
  const results = await uploadAll(pages, token, dryRun);
  console.log();

  // Summary
  const errors = results.filter((r) => r.status === 'error');
  if (errors.length > 0) {
    console.log('Failed uploads:');
    errors.forEach((e) => console.log(`  ${e.path}: ${e.statusCode || e.error}`));
  }

  console.log('=== Import complete ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
