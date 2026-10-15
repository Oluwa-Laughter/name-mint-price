# Name & Mint contracts

Solidity 0.8.24 contracts built with Foundry and OpenZeppelin Contracts 5.4.0. The [repository README](../README.md) lists deployed Sepolia addresses, environment variable names, and the complete app setup.

| Contract | Deployment script | Constructor |
| --- | --- | --- |
| `ClassNFT` | `scripts/DeployClassNFT.s.sol` | Treasury address and exact mint fee in wei. |
| `IPFSFileRegistry` | `scripts/DeployIPFSFileRegistry.s.sol` | No arguments. Deployed independently; unused by the current UI. |
| `ETHUSDPriceFeed` | `scripts/DeployETHUSDPriceFeed.s.sol` | Existing feed address and maximum quote age in seconds. |

`AggregatorV3Interface` and `IENSResolver` describe existing services. The mock aggregator is for tests. These are not additional deployments.

## Build and test

Initialize submodules from the repository root with `git submodule update --init --recursive`. From this folder:

```sh
forge build
forge test
forge fmt --check
python3 scripts/export_abi.py
```

The exporter writes JSON and literal TypeScript ABIs for the contracts and interfaces, then syncs the frontend copies and addresses from `deployments/sepolia.json`. After a redeployment, update that public manifest and the root README before exporting again.

## Deploy and verify

Copy `.env.example` to `.env` and configure it locally. Keep optional numeric variables commented out unless assigning valid integers. Import the deployment wallet into an encrypted Foundry keystore:

```sh
cast wallet import sepolia-deployer --interactive
```

Run each script separately from this folder:

```sh
forge script scripts/DeployClassNFT.s.sol:DeployClassNFT \
  --rpc-url sepolia --account sepolia-deployer \
  --gas-estimate-multiplier 800 --broadcast --verify

forge script scripts/DeployIPFSFileRegistry.s.sol:DeployIPFSFileRegistry \
  --rpc-url sepolia --account sepolia-deployer \
  --gas-estimate-multiplier 800 --broadcast --verify

forge script scripts/DeployETHUSDPriceFeed.s.sol:DeployETHUSDPriceFeed \
  --rpc-url sepolia --account sepolia-deployer \
  --gas-estimate-multiplier 800 --broadcast --verify
```

Foundry loads `.env`. These scripts permit Sepolia or local Anvil. The 800% gas-estimate multiplier provides headroom for deployment estimates; transactions pay for gas consumed. Check current node estimates when changing the toolchain or bytecode. The contracts listed in the root README are already deployed and verified; running these commands creates new deployments.

`TREASURY_ADDRESS` is the fixed mint-fee recipient, and `MINT_FEE_WEI` defaults to zero. Anyone can call `withdraw()`, but the payment always goes to that treasury. Both settings are immutable. Read `mintFee()` and send that exact value with `mint(recipient, metadataURI, imageURI)`. Metadata and image URIs are immutable after minting. The paginated gallery reports current owners and original mint payments.

The price deployment script selects the existing Sepolia Chainlink ETH/USD proxy. Quote freshness defaults to 7,200 seconds and can be overridden with `MAX_PRICE_AGE_SECONDS`. Local Anvil requires `LOCAL_PRICE_FEED_ADDRESS` pointing to an existing mock or forked feed. Polling the consumer does not update the upstream feed.

Deployment logs and cache files are ignored because they can contain RPC configuration. Keep only public addresses in `deployments/`; never commit private keys, keystores, environment values, or provider credentials.
