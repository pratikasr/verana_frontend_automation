const path = require("path");
const baseConfig = require("@agoric/synpress/synpress.config");
const { defineConfig } = require("cypress");

const baseSNE = baseConfig.e2e.setupNodeEvents;

module.exports = defineConfig({
  ...baseConfig,
  e2e: {
    ...baseConfig.e2e,
    baseUrl: "https://app.testnet.verana.network",
    specPattern: "tests/e2e/specs/**/*.spec.{js,ts}",
    supportFile: "tests/e2e/support.js",
    setupNodeEvents(on, config) {
      const origOn = on;
      const wrappedOn = (event, handler) => {
        if (event === "before:browser:launch") {
          origOn(event, async (browser, launchOptions) => {
            const result = await handler(browser, launchOptions);
            if (browser.name === "chrome") {
              result.args.push("--no-sandbox", "--disable-dev-shm-usage");

              // Load our pinned MV3 Keplr extension instead of synpress's
              // MV2 version (MV2 is no longer supported in Chrome 146+)
              const keplrDir = path.resolve(
                config.projectRoot || path.resolve(__dirname, "../.."),
                "extensions",
                "keplr"
              );
              // Remove synpress's MV2 extension flags
              result.args = result.args.filter(
                (a) =>
                  !a.startsWith("--disable-extensions-except=") &&
                  !a.startsWith("--load-extension=")
              );
              // Use Cypress extensions array — CfT handles --load-extension
              result.extensions = [keplrDir];
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
  defaultCommandTimeout: 30000,
  taskTimeout: 120000,
});
