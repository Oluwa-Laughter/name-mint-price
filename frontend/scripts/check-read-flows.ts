import assert from "node:assert/strict";
import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import { sepoliaContracts } from "../src/lib/contracts";

async function main() {
const base = process.env.APP_URL || "http://localhost:3000";
const client = createPublicClient({ chain: sepolia, transport: http(`${base}/api/rpc?network=sepolia`, { retryCount: 0 }) });
assert.equal(await client.getChainId(), sepolia.id);
const [price, supply, files] = await Promise.all([
  client.readContract({ ...sepoliaContracts.ethUsdPriceFeed, functionName: "latestPrice" }),
  client.readContract({ ...sepoliaContracts.classNFT, functionName: "totalSupply" }),
  client.readContract({ ...sepoliaContracts.ipfsFileRegistry, functionName: "fileCount" }),
]);
assert.equal(typeof price.answer, "bigint");
console.log("Sepolia RPC proxy: correct network; all three deployed contracts readable");
console.log(`Chainlink: valid=${price.valid}, stale=${price.stale}, age=${price.age.toString()}s; NFT supply=${supply}; files=${files}`);
const [[nfts], [records]] = await Promise.all([
  client.readContract({ ...sepoliaContracts.classNFT, functionName: "getTokens", args: [BigInt(0), BigInt(12)] }),
  client.readContract({ ...sepoliaContracts.ipfsFileRegistry, functionName: "getFiles", args: [BigInt(0), BigInt(10)] }),
]);
console.log(`Gallery reads: ${nfts.length} NFTs and ${records.length} file records on first page`);
const mainnetClient = createPublicClient({ chain: mainnet, transport: http(`${base}/api/rpc?network=mainnet`, { retryCount: 0 }) });
const address = await mainnetClient.getEnsAddress({ name: normalize("vitalik.eth") });
assert(address, "Expected the known mainnet ENS example to resolve");
console.log("Mainnet ENS example: forward lookup works through the server RPC proxy");
const testName = process.env.TEST_ENS_NAME;
if (testName) {
  assert(await client.getEnsAddress({ name: normalize(testName) }), "Sepolia test name did not resolve");
  console.log("Configured Sepolia ENS example: forward lookup works");
} else console.log("Sepolia ENS owner/edit test pending: provide a registered name through TEST_ENS_NAME");

}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Read-flow check failed"); process.exitCode = 1; });
