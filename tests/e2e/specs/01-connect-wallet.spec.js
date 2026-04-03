describe('Connect Keplr Wallet', () => {
  before(() => {
    cy.setupWallet({
      secretWords: Cypress.env('SECRET_WORDS') || process.env.SECRET_WORDS,
      password: Cypress.env('WALLET_PASSWORD') || 'Ayush@2109',
      walletName: 'Verana Test Wallet',
      selectedChains: [],
      createNewWallet: false,
    });
  });

  it('should connect Keplr wallet to the Verana dApp', () => {
    cy.visit('/dashboard');
    cy.wait(3000);

    // MV3 Keplr: use the dApp's native connect flow.
    // Click Connect Wallet → Keplr, then the dApp calls
    // keplr.experimentalSuggestChain() + keplr.enable() internally.
    // Permission was pre-granted so these calls auto-approve.
    cy.contains('Connect Wallet', { timeout: 15000 }).click();
    cy.contains('Keplr', { timeout: 10000 }).click();

    // Wait for the dApp to process — with pre-granted permission,
    // keplr.enable() should auto-approve without a popup
    cy.wait(10000);

    // Verify wallet is connected
    cy.contains('Connect Wallet', { timeout: 30000 }).should('not.exist');
    cy.log('Wallet connected successfully');
  });
});
