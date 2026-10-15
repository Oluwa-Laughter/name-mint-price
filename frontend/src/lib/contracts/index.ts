import { classNFTAbi } from "./abi/ClassNFT";
import { ipfsFileRegistryAbi } from "./abi/IPFSFileRegistry";
import { ethUsdPriceFeedAbi } from "./abi/ETHUSDPriceFeed";
import { aggregatorV3Abi } from "./abi/AggregatorV3Interface";
import { sepoliaDeployment } from "./deployment";

export { classNFTAbi, ipfsFileRegistryAbi, ethUsdPriceFeedAbi, aggregatorV3Abi, sepoliaDeployment };
export { ensResolverAbi } from "./abi/IENSResolver";

export const SEPOLIA_CHAIN_ID = sepoliaDeployment.chainId;
export const CLASSNFT_ADDRESS = sepoliaDeployment.contracts.ClassNFT;
export const IPFSFILEREGISTRY_ADDRESS = sepoliaDeployment.contracts.IPFSFileRegistry;
export const ETHUSDPRICEFEED_ADDRESS = sepoliaDeployment.contracts.ETHUSDPriceFeed;

/** Public deployment addresses paired with literal ABIs for wagmi/viem calls. */
export const sepoliaContracts = {
  classNFT: {
    address: CLASSNFT_ADDRESS,
    abi: classNFTAbi,
    chainId: SEPOLIA_CHAIN_ID,
  },
  ipfsFileRegistry: {
    address: IPFSFILEREGISTRY_ADDRESS,
    abi: ipfsFileRegistryAbi,
    chainId: SEPOLIA_CHAIN_ID,
  },
  ethUsdPriceFeed: {
    address: ETHUSDPRICEFEED_ADDRESS,
    abi: ethUsdPriceFeedAbi,
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
