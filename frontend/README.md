# Name & Mint frontend

Next.js app for ENS lookups and profiles, NFT Studio, and live Chainlink ETH/USD pricing. Uses React, wagmi, viem, and TanStack Query with server-side Pinata uploads.

Live app: [name-and-mint.vercel.app](https://name-and-mint.vercel.app).

See the [repository README](../README.md) for setup, environment variable names, deployed contracts, upload limits, checks, and Vercel deployment instructions.

From this folder:

```sh
npm ci
cp .env.example .env.local
# Configure local variables before starting. Preserve an existing .env.local.
npm run dev
```

Keep `PINATA_JWT`, `SEPOLIA_RPC_URL`, and `MAINNET_RPC_URL` server-only. The only public environment variable is `NEXT_PUBLIC_IPFS_GATEWAY`. Never commit local environment files.
