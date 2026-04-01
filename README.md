Title: Verana Frontend Automation

What it does: E2E test suite for the Verana testnet dApp using Synpress (Cypress + Keplr wallet automation). Automates wallet connection, chain approval, trust registry creation, on-chain TX verification, and governance approval.

Prerequisites:

Ubuntu 22.04 VM (4 vCPU, 8 GB RAM)
Node.js 20 LTS
Chrome browser
Xvfb (for headless display)
Setup:

Clone the repo
npm install
Copy .env.example to .env and fill in your Keplr mnemonic
npm run download:keplr to download the pinned Keplr extension
Run tests:

DISPLAY=:99 npm run test:e2e (headless on VM)
npm run test:e2e:open (interactive Cypress UI)
Test cases:

Connect Keplr wallet to the dApp
Approve Verana testnet chain suggestion
Create trust registry ecosystem with unique DID
Verify transaction confirmed on-chain via RPC
Submit and approve governance action
Notes:

Never commit .env — it contains your wallet mnemonic
Keplr is pinned at v0.12.156 to prevent selector breakage from auto-updates
CSS selectors in test 03 may need tuning to match the live dApp HTML
Requires a pre-funded test wallet with VNA tokens on Verana testnet
