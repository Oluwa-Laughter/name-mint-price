# Diamond deployment and upgrades

Current Sepolia router: [0xcFF92631199b6Cb3A6E99fC1e4c384A87FB2051f](https://sepolia.etherscan.io/address/0xcFF92631199b6Cb3A6E99fC1e4c384A87FB2051f#code). The facets and initializer are recorded in `deployments/diamond-sepolia.json`.

The new implementation uses [EIP-2535](https://eips.ethereum.org/EIPS/eip-2535). A single `Diamond` routes calls through `delegatecall` to six facets:

| Facet | Functions |
| --- | --- |
| `DiamondCutFacet` | Owner-only atomic add, replace, and remove operations; emits `DiamondCut`. |
| `DiamondLoupeFacet` | Lists facets/selectors and reports supported interfaces. |
| `OwnershipFacet` | Reports the owner and transfers upgrade authority to a nonzero address. |
| `NFTFacet` | ERC-721 minting/transfers/approvals, metadata, gallery, mint records, and treasury withdrawals. |
| `PriceFeedFacet` | Reads the existing Chainlink ETH/USD proxy and validates quote freshness. |
| `FileRegistryFacet` | Preserves the independent file registry capability, without adding a standalone frontend uploader. |

Application calls use the **Diamond address**, never the individual facet addresses. The NFT collection name is `Name & Mint` and its symbol is `NMINT`.

The owner can replace application logic, including logic affecting tokens, metadata, funds, and permissions. This version exposes no metadata or fee setter, but upgradeability means those behaviors are not permanently immutable. A multisig can hold ownership; using a multisig requires submitting upgrade calls through that multisig's transaction process.

NFT, registry, and feed settings have separate storage namespaces. OpenZeppelin Contracts Upgradeable 5.4.0 provides ERC-7201 token, metadata, initialization, and reentrancy state. Future facets must preserve these layouts and append fields compatibly. Reordering or deleting fields can corrupt existing data. Initialization is atomic in the Diamond constructor; implementation initializers are locked, and the initializer selector is excluded from routing.

Routing/cut/loupe code is adapted from the pinned MIT reference identified in [src/diamond/REFERENCE.md](src/diamond/REFERENCE.md). This project has automated tests, not an independent security audit.

## Fresh Sepolia deployment

The old three contracts are standalone deployments and cannot be converted into proxies. A new Diamond starts a new NFT collection and empty registry. Existing NFTs and files remain at their original addresses; no automatic migration is implemented.

From `contracts/`, initialize dependencies, build, and test:

```sh
git submodule update --init --recursive
forge build
forge test
forge fmt --check
```

The compiler settings are Solidity 0.8.24, Cancun, optimizer 200 runs, with `via_ir = true`. Use these settings for source verification. Add `DIAMOND_OWNER` to the local ignored `.env`, alongside the existing treasury and RPC configuration. The owner can differ from the deployment account. The script selects Sepolia's existing Chainlink feed; local Anvil needs `LOCAL_PRICE_FEED_ADDRESS`.

Simulate first without signing or broadcasting:

```sh
forge script scripts/DeployDiamond.s.sol:DeployDiamond --rpc-url sepolia
```

Deploy using your encrypted `deployer` keystore:

```sh
forge script scripts/DeployDiamond.s.sol:DeployDiamond \
  --rpc-url sepolia --account deployer \
  --gas-estimate-multiplier 800 --slow --broadcast --verify
```

The script creates six facets, one initializer, and the Diamond in separate deployment transactions. The Diamond constructor installs all selectors and initializes application state atomically. Users still submit one transaction per mint; the deployer's setup transactions are separate. Review current node gas estimates with your Foundry version before broadcasting.

If verification was interrupted after successful deployment, verify all successful transactions from that script run without deploying again:

```sh
forge script scripts/DeployDiamond.s.sol:DeployDiamond \
  --rpc-url sepolia --account deployer --resume --verify
```

If submission stops with `in-flight transaction limit reached for delegated accounts`, inspect the pending receipt and deployment account's latest/pending nonces first. When the submitted transaction succeeded and the nonce matches the next unsent transaction, continue the recorded run sequentially:

```sh
forge script scripts/DeployDiamond.s.sol:DeployDiamond \
  --rpc-url sepolia --account deployer \
  --resume --slow --broadcast --verify
```

`--slow` waits for each transaction to succeed before submitting the next. Keep the existing broadcast log and avoid unrelated transactions from the deployment account until the run finishes. The predicted Diamond address is usable only after its creation receipt succeeds.

Only use `--resume` after inspecting receipts and confirming the recorded deployment transactions succeeded. Failed creations require diagnosis before a new run.

After deployment, pass the **Diamond/router address** printed by the script to:

```sh
python3 scripts/activate_diamond.py "$DIAMOND_ADDRESS"
```

Set the shell variable to the new public address first. The activation script checks the network, deployed bytecode, every routed application/management selector, ERC-721 support, nonzero owner, and the Chainlink proxy before updating `deployments/sepolia.json`. It exports all ABIs and frontend bindings. Until activation, the frontend continues using the old standalone addresses. The manifest retains those legacy addresses for reference.

`abi/NameMintDiamond.json` and its TypeScript export combine all routed interfaces. For typed feature calls, use the NFT/price/registry facet ABI with the same Diamond address. `abi/Diamond.json` describes the router's own constructor/fallback and is not the full application ABI.

## Subsequent upgrades

Deploy and verify the replacement facet first. Review its source and storage layout against the installed version. Inspect `facets()`, `facetAddress(bytes4)`, and the selectors returned by `forge inspect` before choosing the cut.

Configure these local variable names for `scripts/UpgradeDiamond.s.sol`:

- `DIAMOND_ADDRESS`: the existing router.
- `UPGRADE_ACTION`: Add=0, Replace=1, Remove=2.
- `UPGRADE_FACET_ADDRESS`: deployed facet address, or zero for removal.
- `UPGRADE_SELECTORS`: comma-separated four-byte selectors; only reviewed selectors are changed.
- `UPGRADE_EXPECTED_OLD_FACET`: the current facet that must own every selected selector; zero for additions. Use separate cuts/runs if the selectors currently belong to different facets.
- `UPGRADE_INIT_ADDRESS` and `UPGRADE_INIT_CALLDATA`: optional reviewed migration initializer and calldata; omit both when no migration is needed.

Simulate, then submit using the owner's encrypted account:

```sh
forge script scripts/UpgradeDiamond.s.sol:UpgradeDiamond --rpc-url sepolia
forge script scripts/UpgradeDiamond.s.sol:UpgradeDiamond \
  --rpc-url sepolia --account deployer --broadcast
```

A simulation without the owner's sender may fail the ownership check; use `--sender` with the public owner address when simulating. A multisig owner must execute the encoded `diamondCut` through the multisig instead of an EOA keystore. The script checks the old mapping and the contract enforces ownership, valid targets, and selector rules. `diamondCut` is atomic: a failing initializer reverts the routing changes too.

Removing upgrade selectors can permanently disable future upgrades. Do not install the original constructor initializer as an upgrade migration. New migrations need their own replay guard and storage-compatible versioning.
