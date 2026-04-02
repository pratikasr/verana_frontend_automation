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

    // Try to enable Keplr directly via the JS API
    // This will tell us exactly what error Keplr returns
    cy.window().then((win) => {
      cy.log('window.keplr exists: ' + !!win.keplr);
      if (win.keplr) {
        cy.log('Calling keplr.enable("vna-testnet-1")...');
        cy.wrap(
          win.keplr.enable('vna-testnet-1').then(
            () => 'SUCCESS',
            (err) => 'ERROR: ' + err.message
          )
        ).then((result) => {
          cy.log('keplr.enable result: ' + result);
        });
      }
    });

    cy.wait(5000);
    cy.log('Test completed — check logs for keplr.enable result');
  });
});
