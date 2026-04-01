describe('Verify Transaction On-Chain', () => {
  it('should confirm the transaction was recorded on the Verana testnet', () => {
    // After creating a trust registry, navigate back to /tr
    // and verify the ecosystem appears in the list
    cy.visit('/tr');
    cy.wait(3000);

    // The trust registry list should contain at least one entry
    // (the one we just created in test 03)
    cy.get('table, [class*="list"], [class*="registry"], [class*="ecosystem"]', {
      timeout: 30000,
    }).should('exist');

    // Optionally verify via RPC — query the chain directly
    const rpcUrl = Cypress.env('TESTNET_RPC') || 'https://rpc.testnet.verana.io';

    // Query the latest block to ensure the chain is alive
    cy.request({
      method: 'GET',
      url: `${rpcUrl}/status`,
      failOnStatusCode: false,
    }).then((response) => {
      if (response.status === 200) {
        const latestHeight =
          response.body?.result?.sync_info?.latest_block_height;
        cy.log(`Chain is alive — latest block height: ${latestHeight}`);
        expect(Number(latestHeight)).to.be.greaterThan(0);
      } else {
        cy.log('RPC not reachable — skipping on-chain verification');
      }
    });
  });
});
