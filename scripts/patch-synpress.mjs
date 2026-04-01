#!/usr/bin/env node

/**
 * Patches @agoric/synpress for MV3 Keplr + Chrome for Testing compatibility.
 *
 * Problems solved:
 * 1. chrome://extensions page doesn't list extensions in Chrome for Testing →
 *    detect extensions via CDP /json endpoint instead.
 * 2. Keplr MV3 doesn't auto-open register.html on install →
 *    open it manually after detection.
 *
 * Run: node scripts/patch-synpress.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const filePath = path.join(
  ROOT,
  'node_modules',
  '@agoric',
  'synpress',
  'commands',
  'playwright-keplr.js',
);

if (!fs.existsSync(filePath)) {
  console.log('synpress not installed yet, skipping patch');
  process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace getExtensionsData — use CDP instead of chrome://extensions
const getExtRe =
  /async getExtensionsData\(\) \{[\s\S]*?return extensionsData;\s*\},/;
const newGetExt = `async getExtensionsData() {
    if (!_.isEmpty(extensionsData)) {
      return extensionsData;
    }

    // Chrome for Testing: detect extensions via CDP (chrome://extensions
    // page does not list loaded extensions in headless/CfT mode)
    try {
      const resp = await fetch('http://127.0.0.1:9222/json/list');
      const targets = await resp.json();
      const knownBuiltins = new Set([
        'nmmhkkegccagdldgiimedpiccmgmieda',
        'nkeimhogjdpnpccoofpliimaahmaaome',
        'ghbmnnjooekpmoecnnnilnnbdlolhkhi',
        'ahfgeienlihckogmohjhadlkjgocpleb',
        'fignfifoniblkonapihmkfakmlgkbkcf',
        'mhjfbmdgcfjbbpaeojofohoefgiehjai',
      ]);
      for (const target of targets) {
        const match = target.url.match(
          /chrome-extension:\\/\\/([a-z]+)\\//,
        );
        if (!match) continue;
        const extId = match[1];
        if (knownBuiltins.has(extId)) continue;

        if (
          target.type === 'service_worker' &&
          target.url.includes('background.bundle.js')
        ) {
          extensionsData['keplr'] = { version: 'mv3', id: extId };
        } else if (
          target.type === 'background_page' &&
          !extensionsData['keplr']
        ) {
          extensionsData['keplr'] = { version: 'mv2', id: extId };
        }
      }
    } catch (e) {
      console.error('[synpress-patch] CDP extension detection failed:', e.message);
      // Fall back to original chrome://extensions approach
      const context = await browser.contexts()[0];
      const page = await context.newPage();
      await page.goto('chrome://extensions');
      await page.waitForLoadState('load');
      await page.waitForLoadState('domcontentloaded');
      const devModeButton = page.locator('#devMode');
      await devModeButton.waitFor();
      await devModeButton.focus();
      await devModeButton.click();
      const extensionDataItems = await page.locator('extensions-item').all();
      for (const extensionData of extensionDataItems) {
        const extensionName = (
          await extensionData.locator('#name-and-version').locator('#name').textContent()
        ).toLowerCase().trim();
        const extensionId = (
          await extensionData.locator('#extension-id').textContent()
        ).replace('ID: ', '');
        extensionsData[extensionName] = { version: '', id: extensionId.trim() };
      }
      await page.close();
    }

    return extensionsData;
  },`;

if (getExtRe.test(content)) {
  content = content.replace(getExtRe, newGetExt);
  console.log('✓ Patched getExtensionsData (CDP-based detection)');
} else {
  console.log('⚠ getExtensionsData already patched or not found');
}

// 2. Replace assignWindows — handle MV3 (no auto register.html)
const assignWinRe =
  /async assignWindows\(\) \{[\s\S]*?return true;\s*\},/;
const newAssignWin = `async assignWindows() {
    const keplrExtensionData = (await module.exports.getExtensionsData()).keplr;

    let pages = await browser.contexts()[0].pages();

    for (const page of pages) {
      if (page.url().includes('specs/runner')) {
        mainWindow = page;
      } else if (
        keplrExtensionData &&
        page.url().includes(
          'chrome-extension://' + keplrExtensionData.id + '/register.html',
        )
      ) {
        keplrWindow = page;
      }
    }

    // MV3 fix: Keplr may not auto-open register.html
    if (!keplrWindow && keplrExtensionData && keplrExtensionData.id) {
      const context = await browser.contexts()[0];
      keplrWindow = await context.newPage();
      await keplrWindow.goto(
        'chrome-extension://' + keplrExtensionData.id + '/register.html#',
        { waitUntil: 'load' },
      );
      await new Promise((r) => setTimeout(r, 3000));
    }

    return true;
  },`;

if (assignWinRe.test(content)) {
  content = content.replace(assignWinRe, newAssignWin);
  console.log('✓ Patched assignWindows (MV3 register.html fallback)');
} else {
  console.log('⚠ assignWindows already patched or not found');
}

// 3. Add delay in init() for extension service worker to start
const initReturn = 'return browser.isConnected();';
if (
  content.includes(initReturn) &&
  !content.includes('// patched: wait for extension')
) {
  content = content.replace(
    initReturn,
    `// patched: wait for extension service worker to start
    await new Promise(r => setTimeout(r, 3000));
    return browser.isConnected();`,
  );
  console.log('✓ Patched init() (3s delay for extension loading)');
}

fs.writeFileSync(filePath, content);
console.log('All patches applied to playwright-keplr.js');
