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

    // Approve the Keplr connection popup
    // Use acceptAccess which handles MV3 popup detection
    cy.acceptAccess().then(() => {
      // After approval, wait for the dApp to process the connection
      cy.wait(5000);
    });

    // Verify wallet is connected — the "Connect Wallet" button should disappear
    // Use a longer timeout as chain connection can take time
    cy.contains('Connect Wallet', { timeout: 60000 }).should('not.exist');
    cy.log('Wallet connected successfully');
  });
});
