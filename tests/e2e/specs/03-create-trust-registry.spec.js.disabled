const { v4: uuidv4 } = require('uuid');

describe('Create Trust Registry (Ecosystem)', () => {
  const ecosystemDid = `did:verana:${uuidv4().replace(/-/g, '').substring(0, 8)}`;

  before(() => {
    // Ensure wallet is connected before running this test
    cy.visit('/dashboard');
    cy.wait(2000);
  });

  it('should create an ecosystem with unique DID and approve Keplr TX', () => {
    // STEP 1: Navigate to Trust Registry page
    cy.visit('/tr');
    cy.log(`Using DID: ${ecosystemDid}`);

    // STEP 2: Click "Create Ecosystem"
    cy.contains('Create Ecosystem', { timeout: 15000 }).should('be.visible').click();
    cy.wait(1000);

    // STEP 3: Enter DID
    cy.get('input[placeholder*="DID"], input[name*="did"], input[id*="did"]', {
      timeout: 10000,
    })
      .first()
      .clear()
      .type(ecosystemDid);

    // STEP 4: Enter Aka (URL)
    cy.get('input[placeholder*="Aka"], input[name*="aka"], input[id*="aka"]')
      .first()
      .clear()
      .type('https://app.testnet.verana.network/tr');

    // STEP 5: Select governance language (English)
    // Try dropdown or select element
    cy.get('body').then(($body) => {
      if ($body.find('select').length) {
        cy.get('select').first().select('English');
      } else {
        // Click dropdown and select English
        cy.contains('Language').parent().click();
        cy.contains('English').click();
      }
    });

    // STEP 6: Enter Governance Doc URL
    cy.get(
      'input[placeholder*="Governance"], input[placeholder*="URL"], input[name*="governance"], input[id*="governance"]'
    )
      .last()
      .clear()
      .type('https://app.testnet.verana.network/tr');

    // STEP 7: Click Confirm
    cy.contains('Confirm').click();
    cy.wait(1000);

    // STEP 8: Approve Keplr transaction signing
    cy.confirmTransaction();
    cy.log('Keplr transaction approved');

    // STEP 9: Wait for TX success confirmation
    cy.contains(/success|confirmed|transaction/i, { timeout: 60000 }).should(
      'be.visible'
    );
    cy.log(`Ecosystem created with DID: ${ecosystemDid}`);
  });
});
