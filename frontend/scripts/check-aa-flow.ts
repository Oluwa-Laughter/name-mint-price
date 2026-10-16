/** Opt-in Sepolia integration: one sponsored operation containing exactly two mints.
 * Generates a disposable signer in memory. Never loads or writes a wallet private key.
 * PIMLICO_API_KEY stays on the deployed server, not in this process.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createPublicClient, decodeEventLog, http, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createBundlerClient, getUserOperationHash } from "viem/account-abstraction";
import { sepolia } from "viem/chains";
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { buildBatchMintCalls } from "../src/lib/aa/batch";
import { ENTRY_POINT, SIMPLE_FACTORY } from "../src/lib/aa/constants";
import { CLASSNFT_ADDRESS, nftFacetAbi } from "../src/lib/contracts";

async function main() {
  if (!process.argv.includes("--send")) throw new Error("This sends a real Sepolia batch. Run with --send to opt in.");
  const origin = process.env.APP_ORIGIN || "https://name-and-mint.vercel.app";
  const recipient = "0xFcb3C3195dFdB51B41bb7F0e659F05028Aa25AC6" as Address;
  const transport = () => http(`${origin}/api/bundler`, { retryCount: 0, timeout: 55_000, fetchOptions: { headers: { Origin: origin } } });
  const publicClient = createPublicClient({ chain: sepolia, transport: http(`${origin}/api/rpc?network=sepolia`) });
  const fee = await publicClient.readContract({ address: CLASSNFT_ADDRESS, abi: nftFacetAbi, functionName: "mintFee" });
  if (fee !== 0n) throw new Error("This disposable integration account cannot pay nonzero mint fees. Use a funded smart account in the app.");
  const signer = privateKeyToAccount(generatePrivateKey());
  const account = await toSimpleSmartAccount({ client: publicClient, owner: signer, entryPoint: ENTRY_POINT, factoryAddress: SIMPLE_FACTORY });
  const pimlico = createPimlicoClient({ chain: sepolia, entryPoint: ENTRY_POINT, transport: transport() });
  const smartClient = createSmartAccountClient({ account, chain: sepolia, client: publicClient, bundlerTransport: transport(), paymaster: pimlico, userOperation: { estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast } });
  const prepared = await smartClient.prepareUserOperation({ calls: buildBatchMintCalls({
    recipients: [recipient, recipient], mintFee: fee,
    metadataURI: "ipfs://bafkreibslmi2e6cxdg7swqcocaevnheryq6nyyksqkjxbssoz5kvqv22bu",
    imageURI: "ipfs://bafkreihxef4zmatyn5czahbtwuhxexekeqpsaywv2e3onhwaadub3kbmfe",
  }) });
  const signed = { ...prepared, signature: await account.signUserOperation(prepared) };
  const hash = getUserOperationHash({ userOperation: signed, chainId: sepolia.id, entryPointAddress: ENTRY_POINT.address, entryPointVersion: ENTRY_POINT.version });
  console.log(JSON.stringify({ userOperationHash: hash, smartAccount: account.address, testSigner: signer.address }));
  const bundler = createBundlerClient({ chain: sepolia, transport: transport() });
  await bundler.sendUserOperation({ ...signed, entryPointAddress: ENTRY_POINT.address });
  const receipt = await bundler.waitForUserOperationReceipt({ hash, timeout: 180_000, pollingInterval: 4_000 });
  if (!receipt.success) throw new Error(`Batch reverted in ${receipt.receipt.transactionHash}`);
  const tokens = receipt.receipt.logs.filter((log) => log.address.toLowerCase() === CLASSNFT_ADDRESS.toLowerCase()).flatMap((log) => {
    try { return [decodeEventLog({ abi: nftFacetAbi, eventName: "NFTMinted", data: log.data, topics: log.topics }).args.tokenId.toString()]; } catch { return []; }
  });
  if (tokens.length !== 2) throw new Error("The successful operation did not emit exactly two NFTMinted events.");
  const proof = { chainId: sepolia.id, diamond: CLASSNFT_ADDRESS, userOperationHash: hash, transactionHash: receipt.receipt.transactionHash, blockNumber: receipt.receipt.blockNumber.toString(), smartAccount: account.address, testSigner: signer.address, recipient, tokens, transactionFrom: receipt.receipt.from, transactionTo: receipt.receipt.to, paymaster: receipt.paymaster, actualGasCost: receipt.actualGasCost.toString(), actualGasUsed: receipt.actualGasUsed.toString(), success: receipt.success };
  await mkdir(".artifacts", { recursive: true });
  await writeFile(".artifacts/day4-userop.json", JSON.stringify(proof, null, 2) + "\n");
  console.log(JSON.stringify(proof, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[endpoint]") : "Integration failed"); process.exitCode = 1; });
