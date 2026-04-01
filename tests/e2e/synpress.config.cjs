const baseConfig = require('@agoric/synpress/synpress.config');
const { defineConfig } = require('cypress');

module.exports = defineConfig({
  ...baseConfig,
  e2e: {
    ...baseConfig.e2e,
    baseUrl: 'https://app.testnet.verana.network',
    specPattern: 'tests/e2e/specs/**/*.spec.{js,ts}',
    supportFile: 'tests/e2e/support.js',
  },
  // Increase timeouts for blockchain TX confirmations
  defaultCommandTimeout: 30000,
  taskTimeout: 120000,
});
