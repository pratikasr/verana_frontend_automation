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

  // MV3: enable side panel mode so approval popups appear as accessible pages
  async enableSidePanelMode() {
    const keplrExtensionData = (await module.exports.getExtensionsData()).keplr;
    if (!keplrExtensionData) return;

    const extPrefix = 'chrome-extension://' + keplrExtensionData.id;
    const context = await browser.contexts()[0];
    const page = await context.newPage();

    try {
      // Set narrow viewport so Keplr renders in popup mode with hamburger menu
      await page.setViewportSize({ width: 360, height: 600 });
      await page.goto(extPrefix + '/popup.html', { waitUntil: 'load' });
      await new Promise(r => setTimeout(r, 3000));

      // Open the hamburger menu by clicking the menu icon in the top-right
      // From the DOM inspection: it's a div with SVG containing 3 lines
      // at the very top-right of the popup, next to the wallet name
      // Debug: dump all SVGs to find the hamburger menu
      const svgDump = await page.evaluate(() => {
        const svgs = document.querySelectorAll('svg');
        return Array.from(svgs).map((svg, i) => {
          const rect = svg.getBoundingClientRect();
          const paths = svg.querySelectorAll('path, line, rect, circle');
          const outerHTML = svg.outerHTML.substring(0, 200);
          return i + ': ' + paths.length + 'children ' + Math.round(rect.left) + ',' + Math.round(rect.top) + ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ' | ' + outerHTML;
        }).join('\\n');
      });
      console.log('[enableSidePanelMode] All SVGs:\\n' + svgDump);

      // Try clicking each SVG starting from the last (hamburger is usually last in header)
      let clicked = 'not found';
      const svgs = page.locator('svg');
      const svgCount = await svgs.count();
      // Click the last SVG that is in the top area (likely the hamburger)
      for (let i = svgCount - 1; i >= 0; i--) {
        const svg = svgs.nth(i);
        const box = await svg.boundingBox();
        if (box && box.y < 80 && box.width < 50) {
          await svg.click({ force: true });
          clicked = 'clicked svg index ' + i + ' at ' + Math.round(box.x) + ',' + Math.round(box.y);
          break;
        }
      }
      console.log('[enableSidePanelMode] Menu click:', clicked);
      console.log('[enableSidePanelMode] Menu click:', clicked);
      await new Promise(r => setTimeout(r, 2000));

      // Now look for "Side Panel Mode" and click it
      const sidePanelText = page.getByText('Side Panel Mode');
      const found = await sidePanelText.count();
      console.log('[enableSidePanelMode] Side Panel Mode found:', found > 0);

      if (found > 0) {
        // Click the parent container of "Side Panel Mode" which toggles it
        await sidePanelText.click();
        await new Promise(r => setTimeout(r, 2000));
        console.log('[enableSidePanelMode] Side panel mode toggled');
      } else {
        // Log what we see for debugging
        const bodyText = await page.innerText('body').catch(() => '');
        console.log('[enableSidePanelMode] Menu content:', bodyText.substring(0, 300));
      }
    } catch (e) {
      console.log('[enableSidePanelMode] Error:', e.message.substring(0, 150));
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
    const notificationPage = await playwright.switchToKeplrNotification();
    console.log('[acceptAccess] notification URL:', notificationPage.url());
    console.log('[acceptAccess] body text:', (await notificationPage.innerText('body').catch(() => '')).substring(0, 200));

    // MV3 Keplr: try clicking "Approve" button text first, then fall back to generic button
    try {
      const approveBtn = notificationPage.getByRole('button', { name: /approve/i }).first();
      await approveBtn.waitFor({ timeout: 10000 });
      await approveBtn.click();
      console.log('[acceptAccess] Clicked Approve button');
    } catch (e) {
      console.log('[acceptAccess] No Approve button, trying generic button');
      await playwright.waitAndClick(
        notificationPageElements.approveButton,
        notificationPage,
      );
    }
    // MV3 fix: popup opened via newPage() won't auto-close — close it manually
    await new Promise(r => setTimeout(r, 3000));
    if (notificationPage && !notificationPage.isClosed()) {
      await notificationPage.close().catch(() => {});
    }
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
