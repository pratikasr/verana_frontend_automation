describe('Suggest Verana Chain', () => {
  it('should approve the Verana testnet chain suggestion', () => {
    cy.visit('/dashboard');

    // If the dApp calls keplr.experimentalSuggestChain(), Keplr shows
    // an "Add Chain" popup. acceptAccess() handles that approval.
    // This typically fires automatically on first connection.
    // If the chain was already added, this test verifies no error occurs.

    cy.contains('Connect Wallet', { timeout: 15000 }).then(($btn) => {
      if ($btn.length) {
        cy.wrap($btn).click();
        cy.contains('Keplr', { timeout: 10000 }).click();

        // acceptAccess() handles both chain-add and connection popups
        cy.acceptAccess();
      }
    });

    // Verify we're on the dashboard and no error banners are shown
    cy.url().should('include', '/dashboard');
    cy.get('body').should('not.contain.text', 'Error');
    cy.log('Verana chain accepted successfully');
  });
});
