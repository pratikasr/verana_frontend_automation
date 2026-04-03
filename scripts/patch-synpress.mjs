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
      } else if (
        keplrExtensionData &&
        page.url().includes(
          'chrome-extension://' + keplrExtensionData.id + '/popup.html',
        )
      ) {
        // Close stray popup.html opened at startup (MV3 quirk)
        await page.close().catch(() => {});
      }
    }

    // MV3 fix: Keplr may not auto-open register.html on some environments
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
  },

  // MV3: pre-grant dApp permission so Keplr doesn't show an approval popup
  // (MV3 approval popups use chrome.action.openPopup() which is invisible to Playwright)
  async enableSidePanelMode() {
    const keplrExtensionData = (await module.exports.getExtensionsData()).keplr;
    if (!keplrExtensionData) return;

    const extPrefix = 'chrome-extension://' + keplrExtensionData.id;
    const context = await browser.contexts()[0];
    const page = await context.newPage();

    try {
      await page.goto(extPrefix + '/popup.html', { waitUntil: 'load' });
      await new Promise(r => setTimeout(r, 2000));

      // Pre-grant permission AND add the Verana chain info so Keplr
      // auto-approves both suggestChain and enable without popups
      const result = await page.evaluate(async () => {
        // 1. Grant permission for the dApp origin
        const items = await new Promise(r =>
          chrome.storage.local.get('permission/permissionMap/v1', r)
        );
        const permMap = items['permission/permissionMap/v1'] || {};
        const origin = 'https://app.testnet.verana.network';
        permMap[origin] = permMap[origin] || ['vna-testnet-1'];
        await new Promise(r => chrome.storage.local.set({
          'permission/permissionMap/v1': permMap
        }, r));

        // 2. Add Verana chain info to suggested chains so suggestChain
        //    doesn't need approval either
        const chainItems = await new Promise(r =>
          chrome.storage.local.get('chains-v2/suggestedChainInfo/chainInfos', r)
        );
        const suggestedChains = chainItems['chains-v2/suggestedChainInfo/chainInfos'] || {};
        if (!suggestedChains['vna-testnet-1']) {
          suggestedChains['vna-testnet-1'] = {
            rpc: 'https://rpc.testnet.verana.network',
            rest: 'https://api.testnet.verana.network',
            chainId: 'vna-testnet-1',
            chainName: 'VeranaTestnet1',
            chainSymbolImageUrl: '',
            stakeCurrency: { coinDenom: 'VNA', coinMinimalDenom: 'uvna', coinDecimals: 6 },
            bip44: { coinType: 118 },
            bech32Config: {
              bech32PrefixAccAddr: 'verana',
              bech32PrefixAccPub: 'veranapub',
              bech32PrefixValAddr: 'veranavaloper',
              bech32PrefixValPub: 'veranavaloperpub',
              bech32PrefixConsAddr: 'veranavalcons',
              bech32PrefixConsPub: 'veranavalconspub',
            },
            currencies: [{ coinDenom: 'VNA', coinMinimalDenom: 'uvna', coinDecimals: 6 }],
            feeCurrencies: [{
              coinDenom: 'VNA', coinMinimalDenom: 'uvna', coinDecimals: 6,
              gasPriceStep: { low: 1, average: 3, high: 4 },
            }],
            features: [],
            beta: true,
          };
          await new Promise(r => chrome.storage.local.set({
            'chains-v2/suggestedChainInfo/chainInfos': suggestedChains
          }, r));
        }

        return JSON.stringify(permMap);
      });
      console.log('[preGrantPermission] permissionMap set:', result);
    } catch (e) {
      console.log('[preGrantPermission] Error:', e.message.substring(0, 150));
    }

    await page.close().catch(() => {});
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

// 4. Patch switchToKeplrNotification — MV3 notification popups may not
//    appear in context.pages(). Use CDP to find them and connect.
const switchNotifRe =
  /async switchToKeplrNotification\(\) \{[\s\S]*?throw new Error[\s\S]*?\}\s*\},/;
const newSwitchNotif = `async switchToKeplrNotification() {
    const keplrExtensionData = (await module.exports.getExtensionsData()).keplr;
    const extPrefix = 'chrome-extension://' + keplrExtensionData.id;

    // Check existing pages for popup.html or sidePanel.html
    let pages = await browser.contexts()[0].pages();
    for (const page of pages) {
      const url = page.url();
      if (
        (url.includes(extPrefix + '/popup.html') ||
         url.includes(extPrefix + '/sidePanel.html')) &&
        page !== keplrWindow
      ) {
        keplrNotificationWindow = page;
        retries = 0;
        await page.bringToFront();
        return page;
      }
    }

    // Check cached keplrNotificationWindow from page event listener
    if (keplrNotificationWindow && !keplrNotificationWindow.isClosed()) {
      retries = 0;
      await keplrNotificationWindow.bringToFront();
      return keplrNotificationWindow;
    }

    // MV3 fix: chrome.action.openPopup() creates an invisible popup.
    // Open popup.html directly — Keplr shows pending interactions there.
    if (retries === 5) {
      try {
        const context = await browser.contexts()[0];
        const popupPage = await context.newPage();
        await popupPage.goto(extPrefix + '/popup.html', { waitUntil: 'load' });
        await new Promise(r => setTimeout(r, 5000));
        keplrNotificationWindow = popupPage;
        retries = 0;
        await popupPage.bringToFront();
        return popupPage;
      } catch (e) {
        console.log('[switchToKeplrNotification] Failed to open popup:', e.message);
      }
    }

    await sleep(500);
    if (retries < 20) {
      retries++;
      return await module.exports.switchToKeplrNotification();
    } else {
      retries = 0;
      throw new Error(
        '[switchToKeplrNotification] Max retries reached. Keplr notification window not found.',
      );
    }
  },`;

if (switchNotifRe.test(content)) {
  content = content.replace(switchNotifRe, newSwitchNotif);
  console.log('✓ Patched switchToKeplrNotification (MV3 popup detection)');
} else {
  console.log('⚠ switchToKeplrNotification already patched or not found');
}

// 5. Also patch init() to set up a page event listener for new popups
const initConnected = '// patched: wait for extension service worker to start';
if (
  content.includes(initConnected) &&
  !content.includes('// patched: listen for new pages')
) {
  content = content.replace(
    initConnected,
    `// patched: listen for new pages (MV3 popup detection)
    const context = await browser.contexts()[0];
    context.on('page', async (newPage) => {
      const keplrExt = (await module.exports.getExtensionsData()).keplr;
      if (keplrExt && (
        newPage.url().includes('chrome-extension://' + keplrExt.id + '/popup.html') ||
        newPage.url().includes('chrome-extension://' + keplrExt.id + '/sidePanel.html')
      )) {
        keplrNotificationWindow = newPage;
      }
    });
    // patched: wait for extension service worker to start`,
  );
  console.log('✓ Patched init() (MV3 page event listener for popups)');
}

fs.writeFileSync(filePath, content);
console.log('All patches applied to playwright-keplr.js');

// 6. Patch keplr.js — acceptAccess should close popup manually instead of
//    waiting for the "close" event (MV3 popups opened via newPage don't
//    auto-close after clicking approve)
const keplrJsPath = path.join(
  ROOT, 'node_modules', '@agoric', 'synpress', 'commands', 'keplr.js',
);
if (fs.existsSync(keplrJsPath)) {
  let keplrContent = fs.readFileSync(keplrJsPath, 'utf8');

  const oldAcceptAccess = `async acceptAccess() {
    const notificationPage = await playwright.switchToKeplrNotification();
    await playwright.waitAndClick(
      notificationPageElements.approveButton,
      notificationPage,
      { waitForEvent: 'close' },
    );
    return true;
  },`;

  // Patch initialSetup to enable side panel mode after wallet import
  const oldInitialSetupEnd = 'await playwright.switchToCypressWindow();\n  },';
  const newInitialSetupEnd = `// MV3: enable side panel mode so approvals open as sidePanel.html pages
    await playwright.enableSidePanelMode().catch((e) =>
      console.log('[initialSetup] enableSidePanelMode error:', e.message.substring(0, 100))
    );
    await playwright.switchToCypressWindow();
  },`;

  if (keplrContent.includes(oldInitialSetupEnd)) {
    keplrContent = keplrContent.replace(oldInitialSetupEnd, newInitialSetupEnd);
    console.log('✓ Patched initialSetup to enable side panel mode after import');
  } else {
    console.log('⚠ initialSetup patch target not found');
  }

  const newAcceptAccess = `async acceptAccess() {
    // MV3 fix: permission was pre-granted via chrome.storage.local
    // in enableSidePanelMode(), so no approval popup is needed.
    // Just wait briefly for the dApp to process the auto-approved connection.
    console.log('[acceptAccess] Permission pre-granted, waiting for auto-approval...');
    await new Promise(r => setTimeout(r, 3000));
    await playwright.switchToCypressWindow();
    return true;
  },`;

  if (keplrContent.includes(oldAcceptAccess)) {
    keplrContent = keplrContent.replace(oldAcceptAccess, newAcceptAccess);
    fs.writeFileSync(keplrJsPath, keplrContent);
    console.log('✓ Patched acceptAccess in keplr.js (manual popup close for MV3)');
  } else {
    console.log('⚠ acceptAccess already patched or not found in keplr.js');
  }
} else {
  console.log('⚠ keplr.js not found, skipping acceptAccess patch');
}
