import { classNFTAbi } from "./abi/ClassNFT";
import { ipfsFileRegistryAbi } from "./abi/IPFSFileRegistry";
import { ethUsdPriceFeedAbi } from "./abi/ETHUSDPriceFeed";
import { aggregatorV3Abi } from "./abi/AggregatorV3Interface";
import { nftFacetAbi } from "./abi/NFTFacet";
import { priceFeedFacetAbi } from "./abi/PriceFeedFacet";
import { fileRegistryFacetAbi } from "./abi/FileRegistryFacet";
import { sepoliaDeployment } from "./deployment";

export { classNFTAbi, ipfsFileRegistryAbi, ethUsdPriceFeedAbi, aggregatorV3Abi, sepoliaDeployment };
export { ensResolverAbi } from "./abi/IENSResolver";

export const SEPOLIA_CHAIN_ID = sepoliaDeployment.chainId;
export const DIAMOND_ADDRESS = sepoliaDeployment.diamondAddress;
export const CLASSNFT_ADDRESS = DIAMOND_ADDRESS || sepoliaDeployment.contracts.ClassNFT;
export const IPFSFILEREGISTRY_ADDRESS = DIAMOND_ADDRESS || sepoliaDeployment.contracts.IPFSFileRegistry;
export const ETHUSDPRICEFEED_ADDRESS = DIAMOND_ADDRESS || sepoliaDeployment.contracts.ETHUSDPriceFeed;

/** Public deployment addresses paired with literal ABIs for wagmi/viem calls. */
export const sepoliaContracts = {
  classNFT: {
    address: CLASSNFT_ADDRESS,
    abi: nftFacetAbi,
    chainId: SEPOLIA_CHAIN_ID,
  },
  ipfsFileRegistry: {
    address: IPFSFILEREGISTRY_ADDRESS,
    abi: fileRegistryFacetAbi,
    chainId: SEPOLIA_CHAIN_ID,
  },
  ethUsdPriceFeed: {
    address: ETHUSDPRICEFEED_ADDRESS,
    abi: priceFeedFacetAbi,
    chainId: SEPOLIA_CHAIN_ID,
  },
  chainlinkAggregator: {
    address: sepoliaDeployment.chainlinkEthUsdAggregator,
    abi: aggregatorV3Abi,
    chainId: SEPOLIA_CHAIN_ID,
  },
} as const;

// ENS resolver addresses are discovered per name; use ensResolverAbi with the
// discovered resolver rather than assuming all names share one contract.

export { nftFacetAbi, priceFeedFacetAbi, fileRegistryFacetAbi };
export { diamondCutAbi } from "./abi/DiamondCutFacet";
export { diamondLoupeAbi } from "./abi/DiamondLoupeFacet";
export { ownershipFacetAbi } from "./abi/OwnershipFacet";

export { nameMintDiamondAbi } from "./abi/NameMintDiamond";
