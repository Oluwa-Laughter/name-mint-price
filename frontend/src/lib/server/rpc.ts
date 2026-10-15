import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";

export function rpcEndpoint(network: "sepolia" | "mainnet") {
  return network === "sepolia"
    ? process.env.SEPOLIA_RPC_URL || sepolia.rpcUrls.default.http[0]
    : process.env.MAINNET_RPC_URL || mainnet.rpcUrls.default.http[0];
}
export function serverSepoliaClient() {
  return createPublicClient({ chain: sepolia, transport: http(rpcEndpoint("sepolia"), { timeout: 15_000, retryCount: 1 }) });
}
