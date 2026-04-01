const path = require('path');
const baseConfig = require('@agoric/synpress/synpress.config');
const { defineConfig } = require('cypress');

const baseSNE = baseConfig.e2e.setupNodeEvents;

module.exports = defineConfig({
  ...baseConfig,
  e2e: {
    ...baseConfig.e2e,
    baseUrl: 'https://app.testnet.verana.network',
    specPattern: 'tests/e2e/specs/**/*.spec.{js,ts}',
    supportFile: 'tests/e2e/support.js',
    setupNodeEvents(on, config) {
      const origOn = on;
      const wrappedOn = (event, handler) => {
        if (event === 'before:browser:launch') {
          origOn(event, async (browser, launchOptions) => {
            const result = await handler(browser, launchOptions);
            if (browser.name === 'chrome') {
              if (process.env.CI) {
                result.args.push(
                  '--no-sandbox',
                  '--disable-dev-shm-usage',
                  '--disable-setuid-sandbox',
                );
              }
              // Load our pinned MV3 Keplr extension (synpress defaults
              // to MV2 which Chrome 127+ has deprecated)
              const keplrDir = path.resolve(process.cwd(), 'extensions', 'keplr');
              result.extensions = result.extensions || [];
              result.extensions.push(keplrDir);
            }
            return result;
          });
        } else {
          origOn(event, handler);
        }
      };

      // Tell synpress to skip its own (MV2) Keplr download
      process.env.SKIP_KEPLR_INSTALL = 'true';

      baseSNE(wrappedOn, config);
      return config;
    },
  },
  // Increase timeouts for blockchain TX confirmations
  defaultCommandTimeout: 30000,
  taskTimeout: 120000,
});
