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

    // MV3 Keplr: permission was pre-granted via chrome.storage.local
    // during wallet setup. Call keplr.enable() directly to connect
    // without needing the approval popup.
    cy.window().then((win) => {
      expect(win.keplr).to.exist;
      return win.keplr.enable('vna-testnet-1');
    });

    // Wait for the dApp to process the connection
    cy.wait(5000);

    // Verify wallet is connected — "Connect Wallet" should disappear
    // and the dashboard should show the connected state
    cy.get('body').should('not.contain.text', 'Connect Wallet');
    cy.log('Wallet connected successfully');
  });
});
