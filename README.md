# Name & Mint

Look up an ENS name, explore its profile, and turn an image, profile card, or PDF document into an NFT on Sepolia. Name & Mint combines ENS identity, wallet transactions, server-side Pinata uploads, and a live Chainlink ETH/USD feed in a responsive Next.js app.

**Live app:** [name-and-mint.vercel.app](https://name-and-mint.vercel.app)

## What you can do

| Page       | Features                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ENS        | Resolve a `.eth` name to an address or find an address's verified ENS name. Choose Sepolia or Ethereum mainnet for reads. Update a Sepolia name's ETH address record with an authorized wallet.   |
| Profile    | View an ENS avatar, description, Twitter record, ETH balance, and its USD equivalent. Continue to NFT Studio to make a profile card.                                                              |
| NFT Studio | Mint artwork, profile cards, and PDF documents/certificates. Browse the gallery with current owners, ENS names where available, and the original mint payment converted at today's ETH/USD quote. |
| Smart account | Mint two NFTs from one upload, in one ERC-4337 UserOperation through Pimlico. Request gas sponsorship or pay from the smart account. |
| Live alerts | Watch new Diamond mint events, with verified ENS names and optional browser notifications. |
| Live price | View the Chainlink ETH/USD quote, when it was updated, and its age. Convert ETH amounts using the same quote used across the app.                                                                 |

Read features work without connecting a wallet. Transactions use Sepolia, chain ID **11155111**. Mainnet ENS is read-only. On desktop, use an injected browser wallet; on a phone, open the app in your wallet's built-in browser. WalletConnect is not enabled.

Minting a document records the submitted file; it does not independently verify its issuer or authenticity. USD figures for Sepolia ETH are illustrative. A mint's displayed USD amount is its original ETH payment at the current quote, not an NFT appraisal or resale price.

## Repository layout

```text
contracts/
  src/                 Solidity contracts and external interfaces
  scripts/             Separate deployment scripts and ABI exporter
  test/                Foundry tests and mock price feed
  deployments/         Public Sepolia address manifest
  abi/                 Generated JSON and TypeScript ABIs
frontend/
  src/app/             Pages and server API routes
  src/components/      Wallet, ENS, profile, studio, and gallery UI
  src/lib/contracts/   Frontend ABI copies and deployment addresses
  tests/               Upload, RPC, and account-abstraction policy tests
  scripts/             Optional live integration checks
```

The frontend builds independently of Foundry. Contract ABIs and addresses are copied into it by the ABI export script.

## Run locally

Requirements: Node.js 22 or newer, npm, Python 3, and Foundry for contract development. Initialize the Foundry test dependency after cloning:

```sh
git submodule update --init --recursive
```

Start the app from the repository root:

```sh
cd frontend
npm ci
cp .env.example .env.local
```

Fill in your local configuration, then run:

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). If `.env.local` already exists, edit it instead of overwriting it. For a local production build, run `npm run build` followed by `npm start`.

Contract development, from the repository root:

```sh
cd contracts
forge build
forge test
forge fmt --check
python3 scripts/export_abi.py
```

The exporter refreshes `contracts/abi/`, `frontend/src/lib/contracts/abi/`, and frontend addresses from `contracts/deployments/sepolia.json`.

## Environment variables

Variable names only are listed here. Local values belong in ignored environment files; hosted values belong in Vercel's environment settings.

### Frontend and server routes

Configure upload/RPC variables in `frontend/.env.local` locally. Set Pimlico variables only in Vercel environment settings; do not pull that key into local files. Upload protection uses the existing Vercel project, with no CAPTCHA or extra service keys:

| Name                       | Where it is used | Purpose                                                                                                       |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `PIMLICO_API_KEY` | Server only, Vercel | Required for the deployed smart-account bundler/paymaster proxy. |
| `PIMLICO_SPONSORSHIP_POLICY_ID` | Server only, Vercel | Optional sponsorship policy, selected by the server. |
| `PINATA_JWT`               | Server only      | Required to upload NFT files and metadata; use a Pinata JWT with public upload permissions.                   |
| `SEPOLIA_RPC_URL`          | Server only      | Recommended Sepolia RPC endpoint. A public default is used if omitted.                                        |
| `MAINNET_RPC_URL`          | Server only      | Optional Ethereum mainnet endpoint for ENS reads. A public default is used if omitted.                        |
| `NEXT_PUBLIC_IPFS_GATEWAY` | Browser          | Optional public HTTPS gateway hostname or origin for displaying uploaded files. This is public configuration. |

Never put a JWT, private RPC credential, wallet private key, or Etherscan key in a `NEXT_PUBLIC_` variable. The app does not need a deployment private key. Deployed contract addresses are public constants.

### Contract deployment

Configure these in `contracts/.env` when deploying contracts:

| Name                       | Purpose                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| `SEPOLIA_RPC_URL`          | Sepolia RPC endpoint.                                                     |
| `ETHERSCAN_API_KEY`        | Source verification.                                                      |
| `TREASURY_ADDRESS`         | Wallet that receives ClassNFT mint fees when withdrawn.                   |
| `MINT_FEE_WEI`             | Optional exact mint fee; defaults to zero.                                |
| `MAX_PRICE_AGE_SECONDS`    | Optional maximum accepted Chainlink quote age; defaults to 7,200 seconds. |
| `LOCAL_PRICE_FEED_ADDRESS` | Local Anvil testing only; points to a mock or forked feed.                |
| `DIAMOND_OWNER` | Wallet or multisig that controls Diamond upgrades. |

Use Foundry's encrypted keystore for the deployment wallet. `DIAMOND_OWNER` controls future upgrades. The frontend reads the deployed fee before minting. Legacy standalone contracts keep their original immutable settings.

## Diamond upgrade

The repository now includes a fresh EIP-2535 Diamond implementation with NFT, price-feed, file-registry, cut, loupe, and ownership facets. See [Diamond deployment and upgrade instructions](contracts/DIAMOND.md). The owner controls upgrades; future implementations can change behavior, so metadata and fee rules are no longer described as permanently immutable for the Diamond.

Sepolia Diamond: [0xcFF92631199b6Cb3A6E99fC1e4c384A87FB2051f](https://sepolia.etherscan.io/address/0xcFF92631199b6Cb3A6E99fC1e4c384A87FB2051f#code). The frontend bindings use this single address for NFT, price-feed, and file-registry calls. All eight deployment transactions succeeded, and deployed runtime code matches the local build. The new Diamond starts a new collection; existing NFTs remain at the legacy addresses below. The frontend release is deployed through GitHub. Uploads require the Vercel firewall rule described below to be published.

## Existing Sepolia contracts

| Contract                | Purpose                                                                                                    | Verified source                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| ClassNFT                | ERC-721 minting, immutable metadata/image URIs, mint payment records, and paginated current-owner gallery. | [0xB80666d3d44165C9Cf2a1c8204C25a489aa6e0e5](https://sepolia.etherscan.io/address/0xB80666d3d44165C9Cf2a1c8204C25a489aa6e0e5#code) |
| ETHUSDPriceFeed         | Chainlink quote validation, age reporting, and wei-to-USD conversion.                                      | [0x40b91a2b97538B1f9Bd8994EC621E839470b6345](https://sepolia.etherscan.io/address/0x40b91a2b97538B1f9Bd8994EC621E839470b6345#code) |
| IPFSFileRegistry        | Independent file URI registry; deployed but unused by the current frontend.                                | [0xE846664f9CC57c1a7c7163Ae816Cb1c592B2D3e6](https://sepolia.etherscan.io/address/0xE846664f9CC57c1a7c7163Ae816Cb1c592B2D3e6#code) |
| Chainlink ETH/USD proxy | Existing upstream feed consumed by ETHUSDPriceFeed.                                                        | [0x694AA1769357215DE4FAC081bf1f309aDC325306](https://sepolia.etherscan.io/address/0x694AA1769357215DE4FAC081bf1f309aDC325306#code) |

The app name does not change the deployed ClassNFT contract name. ENS uses the existing network deployment; resolver addresses are discovered per name. Register test names through the [Sepolia ENS app](https://sepolia.app.ens.domains/). Mainnet and Sepolia names/records are separate.

Each project contract has a separate deployment script under `contracts/scripts/`. See [contract deployment instructions](contracts/README.md) for commands and constructor details. Interfaces and the test mock are not additional Sepolia deployments.

## Uploads, transactions, and prices

NFT Studio accepts JPEG, PNG, WebP, GIF, and PDF files up to **1,000,000 bytes (1 MB)**. Artwork and profile cards require an image; document NFTs require a PDF and receive a generated cover image.

The upload route checks Vercel's shared rate-limit service before using Pinata. Users upload without signing a wallet message or solving a CAPTCHA, then confirm one mint transaction in their wallet, paying gas once. Wallet connection and switching networks may still need permission prompts. The server validates file formats and size, pins files and metadata with its private JWT, and returns public file references. Uploading alone does not mint an NFT.

The route uses `@vercel/firewall` with the rate-limit ID `nft-upload`. A missing rule or unavailable rate-limit service rejects uploads with 503; an exceeded limit returns 429 with a retry message. Counters are per region and use the client IP on Vercel. Local development shares a dedicated `local-development` bucket on this project's firewall. There is no durable counter stored in a server process.

The firewall draft starts in observation mode: 30 requests per minute with a log action. This records traffic without enforcing that limit after it is published. Review the traffic before enforcing the recommended target of 3 uploads per minute per IP. This policy is a Vercel setting, separate from Git deployments. See [firewall rollout instructions](frontend/FIREWALL.md). IP limits reduce abuse but can be bypassed with different IPs; they do not prove wallet ownership or completion of a mint. The on-chain creator comes from the transaction sender. A cancelled mint can leave a file pinned.

The JWT and private RPC configuration stay on the server. RPC requests use `/api/rpc`, which restricts upstream networks and read/simulation methods; wallets sign and broadcast transactions. Provider failures return generic messages. Profile cards are snapshots; editing ENS later does not change an existing NFT.

The ETH/USD quote refreshes every 30 seconds. The UI shows its age and disables USD conversions for invalid or stale data. Refreshing the UI reads the feed; it does not cause Chainlink to publish a new round. Conversions use fixed-point bigint arithmetic.

## Checks

From `frontend/`:

```sh
npm test
npm run lint
npx tsc --noEmit
npm run build
```

From `contracts/`:

```sh
forge test
forge build
forge fmt --check
```

With the app running, `npx tsx scripts/check-read-flows.ts` from `frontend/` checks deployed contract reads, the gallery, price, RPC proxy, and mainnet ENS. The optional `check-upload-flow.ts` script makes a real public Pinata upload, and checks retrieval; it is excluded from the default tests and sends no mint transaction. Browser-wallet minting and ENS editing require a wallet and a name you control.

## Account abstraction and live alerts (Day 4)

Open **Smart account**, connect an injected wallet, choose a file and two recipients, then select **Upload and mint two NFTs**. Blank recipients mean the connected wallet; ENS inputs resolve on Sepolia. This deliberately creates two NFTs sharing the same metadata. The normal NFT Studio still supports a single mint.

The app uses `permissionless` with viem, the canonical SimpleAccount factory and EntryPoint v0.7. The connected wallet controls a separate smart account. Its `executeBatch` contains exactly two calls to `NFTFacet.mint` on the existing Diamond; both calls execute atomically. The first operation can deploy the smart account through the factory, so no additional application contract deployment is needed. Wallet connection or a network switch can require a separate permission prompt, but the batch itself needs one owner signature.

Gas sponsorship is requested from Pimlico through `/api/bundler`; the key never enters a browser bundle. The proxy fixes the network and EntryPoint, validates the account against the canonical factory and implementation, restricts calldata to two mints to this Diamond, caps gas quantities, and selects any sponsorship policy server-side. Final sponsorship and submission use the existing Vercel rate-limit service. Configure spending/account limits in the Pimlico dashboard as well: a public proxy and IP limits alone do not provide a per-person spending budget.

Sponsorship covers gas, not a nonzero NFT mint fee. If sponsorship is unavailable, the user can explicitly choose to pay gas and fund the displayed smart account with Sepolia ETH. The app saves the signed operation and its hash in this browser before submission; after a timeout or reload, check its receipt or resubmit the identical signed operation instead of creating another batch. Signatures authorize that exact operation; the smart account nonce prevents executing it twice.

**Live alerts** polls the Diamond's `NFTMinted` events every five seconds, waits two block confirmations, deduplicates events, and resolves creator/recipient names with forward-verified ENS reverse records. It catches up from the last processed block after temporary failures while mounted and displays up to 100 events. On opening, it reads 20 recent blocks without generating pop-ups for old events. Two confirmations reduce reorg exposure but are not finality; browser background throttling and chain reorganizations can affect delivery.

Enable browser notifications with the page button; permission is requested only after that click. A small service worker displays local notifications where supported; notification clicks open Live alerts. The page remains useful without notification permission or a connected wallet.

**These are open-page alerts, not an always-on push service.** Closing the page stops blockchain polling, and browsers can throttle inactive tabs. A production notification service would run a durable event indexer with a persisted cursor, confirmation/reorg handling and deduplication, then deliver Web Push through stored subscriptions even when the page is closed.

To run the opt-in live integration check from `frontend/`, use `npx tsx scripts/check-aa-flow.ts --send`. It creates a disposable signer only in memory, sends one sponsored two-mint Sepolia operation to the project owner's recipient wallet, and saves only public receipt evidence in ignored `.artifacts/day4-userop.json`. It uses the deployed server; it never requires a local Pimlico key. This is a real mint, excluded from the default test suite.
