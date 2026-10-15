import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";

export const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http("/api/rpc?network=sepolia", { retryCount: 1, timeout: 25_000 }),
});
export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http("/api/rpc?network=mainnet", { retryCount: 1, timeout: 25_000 }),
});
export type EnsNetwork = "sepolia" | "mainnet";
export function ensClient(network: EnsNetwork) {
  return network === "mainnet" ? mainnetClient : sepoliaClient;
}
