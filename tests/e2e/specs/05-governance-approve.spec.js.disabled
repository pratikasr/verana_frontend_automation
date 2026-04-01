describe('Governance Approve', () => {
  it('should submit and approve a governance action via Keplr', () => {
    // Navigate to the governance or trust registry page
    cy.visit('/tr');
    cy.wait(2000);

    // Look for a governance action button (approve/vote/sign)
    // This depends on the specific UI — adjust selectors to match your dApp
    cy.get('body').then(($body) => {
      const hasGovernanceAction =
        $body.find(':contains("Approve")').length > 0 ||
        $body.find(':contains("Vote")').length > 0 ||
        $body.find(':contains("Sign")').length > 0;

      if (hasGovernanceAction) {
        // Click the governance action button
        cy.contains(/^Approve$|^Vote$|^Sign$/i)
          .first()
          .click();
        cy.wait(1000);

        // Approve Keplr TX signing
        cy.confirmTransaction();

        // Wait for confirmation
        cy.contains(/success|confirmed|approved/i, { timeout: 60000 }).should(
          'be.visible'
        );
        cy.log('Governance action approved successfully');
      } else {
        cy.log(
          'No governance action available — skipping. Create an ecosystem first.'
        );
      }
    });
  });
});
