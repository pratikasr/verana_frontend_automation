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
            if (browser.name === 'chrome' && process.env.CI) {
              result.args.push(
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
              );
            }
            return result;
          });
        } else {
          origOn(event, handler);
        }
      };
      baseSNE(wrappedOn, config);
      return config;
    },
  },
  // Increase timeouts for blockchain TX confirmations
  defaultCommandTimeout: 30000,
  taskTimeout: 120000,
});
