# Verana Frontend Automation

End-to-end tests for the [Verana testnet dApp](https://app.testnet.verana.network) using [Synpress](https://github.com/AgoricHQ/synpress) (Cypress + Playwright) with the Keplr wallet extension.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  GitHub Actions (self-hosted runner)                    │
│  Server: 168.144.66.119 (DigitalOcean Ubuntu 22.04)    │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Xvfb    │  │  Fluxbox     │  │  Chrome for      │  │
│  │  :99     ├──┤  (window mgr)├──┤  Testing (CfT)   │  │
│  │ 1920x1080│  │              │  │  + Keplr MV3     │  │
│  └──────────┘  └──────────────┘  └──────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Synpress (Cypress + Playwright)                 │   │
│  │  - Cypress drives the dApp                       │   │
│  │  - Playwright controls Keplr extension via CDP   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │  x11vnc      │  │  GitHub      │                    │
│  │  VNC :5901   │  │  Actions     │                    │
│  │  (debugging) │  │  Runner svc  │                    │
│  └──────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

## Test Suite

| Spec | Description |
|------|-------------|
| `01-connect-wallet` | Import Keplr wallet from mnemonic, connect to the dApp |
| `02-suggest-chain` | Approve the Verana testnet chain suggestion in Keplr |
| `03-create-trust-registry` | Create an ecosystem with a unique DID, sign the TX |
| `04-verify-tx-onchain` | Verify the transaction was recorded on-chain via RPC |
| `05-governance-approve` | Submit and approve a governance action via Keplr |

## Prerequisites

- **Node.js 20+**
- **Self-hosted runner** on an Ubuntu server with:
  - Google Chrome (stable) installed
  - Xvfb, fluxbox, x11vnc, xfce4 (for VNC debugging)
  - Chrome for Testing (installed automatically by CI)

## GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `SECRET_WORDS` | Keplr wallet mnemonic (12/24 words) |
| `CYPRESS_WALLET_PASSWORD` | Password for the Keplr wallet |

## Local Development

```bash
# Install dependencies (also runs postinstall synpress patch)
npm ci

# Download the pinned Keplr MV3 extension
npm run download:keplr

# Open Cypress UI (headed mode — requires display)
npm run test:e2e:open

# Run tests headlessly with Chrome for Testing
npx synpress run --configFile=tests/e2e/synpress.config.cjs \
  --browser=/opt/chrome-for-testing/chrome
```

## CI Pipeline

The workflow (`.github/workflows/e2e.yml`) runs on every push/PR to `main`:

1. **Checkout + Node setup** — installs Node 20, caches npm
2. **npm ci** — installs deps, `postinstall` auto-patches synpress for MV3
3. **Download Keplr** — fetches pinned Keplr v0.12.156 (Manifest V3)
4. **Install Chrome for Testing** — downloads CfT matching the stable Chrome version (cached after first run)
5. **Start Xvfb + Fluxbox** — creates virtual display `:99` with a window manager
6. **Run E2E tests** — executes synpress with CfT browser and Keplr extension
7. **Upload screenshots** — saves failure screenshots as artifacts

## Why Chrome for Testing?

Google Chrome (stable, dev, canary) **blocks `--load-extension`** — the flag is disabled in all Google-branded builds. Extensions can only be loaded via `--load-extension` in unbranded Chromium builds. Chrome for Testing (CfT) is Google's official unbranded Chromium for automated testing.

## Why Patch Synpress?

`@agoric/synpress` v3.8.5-beta.0 was built for Keplr Manifest V2 and older Chrome. Three patches are needed (`scripts/patch-synpress.mjs`, applied automatically via `postinstall`):

| Patch | Problem | Solution |
|-------|---------|----------|
| `getExtensionsData` | `chrome://extensions` page doesn't list extensions in CfT | Detect extensions via CDP (`/json/list` endpoint) |
| `assignWindows` | Keplr MV3 doesn't auto-open `register.html` on install | Manually navigate to the register page |
| `init` delay | Extension service worker needs time to start | 3-second delay after CDP connection |

## VNC Access (Debugging)

A VNC server runs on the droplet for visual debugging:

```bash
# Create SSH tunnel and open Screen Sharing
ssh -f -N -L 5901:localhost:5901 root@168.144.66.119
open vnc://localhost:5901
# Password: vnc1234
```

The VNC server runs on display `:1` (separate from tests on `:99`), managed by a systemd service that persists across reboots.

## Server Setup

The self-hosted runner is at `/home/runner/actions-runner/` and runs as a systemd service:

```bash
# Check runner status
ssh root@168.144.66.119 'systemctl status actions.runner.pratikasr-verana_frontend_automation.verana-droplet'

# Check VNC status
ssh root@168.144.66.119 'systemctl status x11vnc'

# View runner logs
ssh root@168.144.66.119 'journalctl -u actions.runner.pratikasr-verana_frontend_automation.verana-droplet -f'
```

## Project Structure

```
.
├── .github/workflows/e2e.yml     # CI pipeline
├── extensions/keplr/              # Pinned Keplr MV3 extension (gitignored, downloaded in CI)
├── scripts/
│   ├── download-keplr.mjs         # Downloads Keplr v0.12.156 MV3 from GitHub Releases
│   └── patch-synpress.mjs         # Patches synpress for MV3 + CfT compatibility
├── tests/e2e/
│   ├── specs/                     # Test specifications (run in order)
│   ├── support.js                 # Cypress support file (loads synpress commands)
│   └── synpress.config.cjs        # Synpress/Cypress configuration
└── package.json
```
