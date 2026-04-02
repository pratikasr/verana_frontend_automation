describe('Connect Keplr Wallet', () => {
  before(() => {
    // Import wallet from mnemonic — runs once before all tests in this file
    cy.setupWallet({
      secretWords: Cypress.env('SECRET_WORDS') || process.env.SECRET_WORDS,
      password: Cypress.env('WALLET_PASSWORD') || 'Ayush@2109',
      walletName: 'Verana Test Wallet',
      selectedChains: [],
      createNewWallet: false,
    });
  });

  it('should connect Keplr wallet to the Verana dApp', () => {
    // Navigate to dashboard
    cy.visit('/dashboard');
    cy.contains('Connect Wallet', { timeout: 15000 }).should('be.visible');

    // Click Connect Wallet button
    cy.contains('Connect Wallet').click();

    // Select Keplr from the wallet modal
    cy.contains('Keplr', { timeout: 10000 }).click();

    // MV3 Keplr: the approval popup uses chrome.action.openPopup()
    // which is invisible to Playwright/Cypress. Instead of using
    // cy.acceptAccess(), we wait and check if the dApp auto-connected.
    // If pre-granted permission worked, it will auto-connect.
    // If not, we retry the connection.
    cy.wait(5000);

    // Check if connected — if "Connect Wallet" still visible, try again
    cy.get('body').then(($body) => {
      if ($body.text().includes('Connect Wallet')) {
        cy.log('First attempt failed, retrying with direct enable...');
        // Try calling keplr.enable directly from the page
        cy.window().then(async (win) => {
          try {
            if (win.keplr) {
              await win.keplr.enable('vna-testnet-1');
              cy.log('Direct keplr.enable succeeded');
            }
          } catch (e) {
            cy.log('keplr.enable error (expected if popup needed): ' + e.message);
          }
        });
        cy.wait(5000);
      }
    });

    // Final verification — allow up to 30s for the connection to process
    cy.contains('Connect Wallet', { timeout: 30000 }).should('not.exist');
    cy.log('Wallet connected successfully');
  });
});
