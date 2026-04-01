#!/usr/bin/env node

/**
 * Downloads and unpacks a pinned version of the Keplr extension.
 *
 * Why pin? Chrome Web Store auto-updates extensions, which can break
 * popup selectors overnight. By downloading a specific release from
 * GitHub and loading it as an unpacked extension, we control exactly
 * which version our tests run against.
 *
 * Usage: node scripts/download-keplr.mjs
 * Output: extensions/keplr/ (unpacked extension directory)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Pin the Keplr version here — update this when you want to upgrade
const KEPLR_VERSION = '0.12.156';
const DOWNLOAD_URL = `https://github.com/chainapsis/keplr-wallet/releases/download/v${KEPLR_VERSION}/keplr-extension-Manifest-v3-v${KEPLR_VERSION}.zip`;

const EXT_DIR = path.join(ROOT, 'extensions', 'keplr');
const ZIP_PATH = path.join(ROOT, 'extensions', `keplr-${KEPLR_VERSION}.zip`);

async function main() {
  // Create extensions directory
  fs.mkdirSync(path.join(ROOT, 'extensions'), { recursive: true });

  // Skip if already downloaded
  if (fs.existsSync(path.join(EXT_DIR, 'manifest.json'))) {
    console.log(`Keplr v${KEPLR_VERSION} already exists at ${EXT_DIR}`);
    return;
  }

  console.log(`Downloading Keplr v${KEPLR_VERSION}...`);
  execSync(`curl -L -o "${ZIP_PATH}" "${DOWNLOAD_URL}"`, { stdio: 'inherit' });

  // Clean and unzip
  if (fs.existsSync(EXT_DIR)) {
    fs.rmSync(EXT_DIR, { recursive: true });
  }
  fs.mkdirSync(EXT_DIR, { recursive: true });

  console.log('Unpacking...');
  execSync(`unzip -o "${ZIP_PATH}" -d "${EXT_DIR}"`, { stdio: 'inherit' });

  // Cleanup zip
  fs.unlinkSync(ZIP_PATH);

  console.log(`Keplr v${KEPLR_VERSION} installed to ${EXT_DIR}`);
}

main().catch((err) => {
  console.error('Failed to download Keplr:', err.message);
  process.exit(1);
});
