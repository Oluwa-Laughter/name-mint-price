import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { mainnet, sepolia } from "viem/chains";

export function makeWagmiConfig() {
  return createConfig({
    chains: [sepolia, mainnet],
    connectors: [injected()],
    ssr: true,
    transports: {
      [sepolia.id]: http("/api/rpc?network=sepolia"),
      [mainnet.id]: http("/api/rpc?network=mainnet"),
    },
  });
}
