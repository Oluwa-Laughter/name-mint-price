import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createBundlerClient } from "viem/account-abstraction";
import { http, type Account, type Chain, type Transport, type WalletClient } from "viem";
import { sepolia } from "viem/chains";
import { sepoliaClient } from "../clients";
import { ENTRY_POINT, SIMPLE_FACTORY, SIMPLE_ACCOUNT_INDEX } from "./constants";

export function operationClient() {
  return createBundlerClient({ chain: sepolia, transport: http("/api/bundler", { retryCount: 0, timeout: 55_000 }) });
}
export async function smartAccount(owner: WalletClient<Transport, Chain | undefined, Account>) {
  return toSimpleSmartAccount({ client: sepoliaClient, owner, entryPoint: ENTRY_POINT, factoryAddress: SIMPLE_FACTORY, index: SIMPLE_ACCOUNT_INDEX });
}
export async function mintAccountClient(owner: WalletClient<Transport, Chain | undefined, Account>, sponsored: boolean) {
  const account = await smartAccount(owner);
  const pimlico = createPimlicoClient({ chain: sepolia, entryPoint: ENTRY_POINT, transport: http("/api/bundler", { retryCount: 0, timeout: 55_000 }) });
  return createSmartAccountClient({
    account, chain: sepolia, client: sepoliaClient,
    bundlerTransport: http("/api/bundler", { retryCount: 0, timeout: 55_000 }),
    paymaster: sponsored ? pimlico : undefined,
    userOperation: { estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast },
  });
}
