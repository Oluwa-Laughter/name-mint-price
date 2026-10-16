import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, encodeFunctionResult, type Address, type Hex } from "viem";
import { buildBatchMintCalls, validateBatchMintData } from "../src/lib/aa/batch";
import { ENTRY_POINT, SIMPLE_FACTORY, simpleBatchAbi, simpleFactoryAbi } from "../src/lib/aa/constants";
import { CLASSNFT_ADDRESS, nftFacetAbi } from "../src/lib/contracts";
import { operationFromCall, parseBundlerCall } from "../src/lib/server/bundler-policy";
import { MINT_TOPIC, validMintLogFilter } from "../src/lib/server/log-filter";
import { GET, POST } from "../src/app/api/bundler/route";

const owner = "0x1111111111111111111111111111111111111111";
const sender = "0x2222222222222222222222222222222222222222";
const cid = "ipfs://bafkreibslmi2e6cxdg7swqcocaevnheryq6nyyksqkjxbssoz5kvqv22bu";
const calls = buildBatchMintCalls({ recipients: [owner, owner], metadataURI: cid, imageURI: cid, mintFee: 0n });
function batch(targets: Address[] = calls.map((c) => c.to), values = [0n, 0n], data = calls.map((c) => c.data)) {
  return encodeFunctionData({ abi: simpleBatchAbi, functionName: "executeBatch", args: [targets, values, data] });
}
const op = () => ({ sender, callData: batch(), factory: SIMPLE_FACTORY, factoryData: encodeFunctionData({ abi: simpleFactoryAbi, functionName: "createAccount", args: [owner, 0n] }), nonce: "0x0", maxFeePerGas: "0x1", maxPriorityFeePerGas: "0x1" });
const call = (method = "eth_estimateUserOperationGas", operation: Record<string, unknown> = op()) => parseBundlerCall({ jsonrpc: "2.0", id: 1, method, params: [operation, ENTRY_POINT.address, "0xaa36a7", { sponsorshipPolicyId: "attacker-policy" }] });
const originalFetch = globalThis.fetch;
const originalEnv = { PIMLICO_API_KEY: process.env.PIMLICO_API_KEY, PIMLICO_SPONSORSHIP_POLICY_ID: process.env.PIMLICO_SPONSORSHIP_POLICY_ID, SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL };
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
test("batch must contain exactly two mints to the Diamond with valid file references", () => {
  assert.deepEqual(validateBatchMintData(batch()).recipients, [owner, owner]);
  assert.throws(() => validateBatchMintData(batch([CLASSNFT_ADDRESS], [0n], [calls[0].data])));
  assert.throws(() => validateBatchMintData(batch(undefined, [0n])));
  assert.throws(() => validateBatchMintData(batch([owner, CLASSNFT_ADDRESS])));
  assert.throws(() => validateBatchMintData((batch() + "00") as Hex));
  const approve = encodeFunctionData({ abi: nftFacetAbi, functionName: "approve", args: [owner, 1n] });
  assert.throws(() => validateBatchMintData(batch(undefined, undefined, [approve, calls[1].data])));
  const bad = buildBatchMintCalls({ recipients: [owner, owner], metadataURI: "https://example.com/data", imageURI: cid, mintFee: 0n });
  assert.throws(() => validateBatchMintData(batch(undefined, undefined, bad.map((c) => c.data))));
});
test("proxy restricts methods, EntryPoint, chain, gas cost and client sponsorship context", () => {
  for (const method of ["eth_sendRawTransaction", "debug_traceCall", "pm_sponsorUserOperation"]) assert.throws(() => call(method));
  const wrong = call(); wrong.params[1] = owner;
  assert.throws(() => operationFromCall(wrong));
  assert.throws(() => operationFromCall(call("eth_estimateUserOperationGas", { ...op(), maxFeePerGas: "0xffffffffffff" })));
  process.env.PIMLICO_SPONSORSHIP_POLICY_ID = "server-policy";
  const paymaster = call("pm_getPaymasterData"); operationFromCall(paymaster);
  assert.deepEqual(paymaster.params[3], { sponsorshipPolicyId: "server-policy" });
  const wrongChain = call("pm_getPaymasterData"); wrongChain.params[2] = "0x1";
  assert.throws(() => operationFromCall(wrongChain));
});
test("Pimlico's initial account-deployment gas estimate fits bounded sponsorship limits", () => {
  // Observed on Sepolia when preparing a first sponsored two-mint UserOperation.
  const estimated = { ...op(), callGasLimit: "0x2f3c27", verificationGasLimit: "0x13cc8c", preVerificationGas: "0xef3b", paymasterVerificationGasLimit: "0xe062", paymasterPostOpGasLimit: "0x1" };
  assert.doesNotThrow(() => operationFromCall(call("pm_getPaymasterData", estimated)));
  assert.throws(() => operationFromCall(call("pm_getPaymasterData", { ...estimated, callGasLimit: "0x4c4b41" })), /gas limits/);
  assert.throws(() => operationFromCall(call("pm_getPaymasterData", { ...estimated, callGasLimit: "0x4c4b40", verificationGasLimit: "0x200000" })), /total gas limit/);
});
test("event polling is scoped to this Diamond and bounded block ranges", () => {
  const filter = { address: CLASSNFT_ADDRESS, topics: [MINT_TOPIC], fromBlock: "0x1", toBlock: "0x1f4" };
  assert.equal(validMintLogFilter([filter], "sepolia"), true);
  for (const bad of [{ ...filter, address: owner }, { ...filter, toBlock: "latest" }, { ...filter, toBlock: "0x1f5" }, { ...filter, topics: [] }, { ...filter, blockHash: "0x1" }]) assert.equal(validMintLogFilter([bad], "sepolia"), false);
  assert.equal(validMintLogFilter([filter], "mainnet"), false);
});
function request(body: unknown, origin = "https://name-and-mint.vercel.app") {
  return new Request("https://name-and-mint.vercel.app/api/bundler", { method: "POST", headers: { origin }, body: JSON.stringify(body) });
}
test("configuration reveals availability only and missing keys fail closed", async () => {
  delete process.env.PIMLICO_API_KEY;
  assert.deepEqual(await (await GET()).json(), { configured: false });
  assert.equal((await POST(request(call()))).status, 503);
  process.env.PIMLICO_API_KEY = "private-test-token";
  assert.deepEqual(await (await GET()).json(), { configured: true });
  assert.equal((await POST(request(call(), "https://untrusted.example"))).status, 403);
});
test("proxy checks canonical sender, chooses policy server-side and removes nested credentials", async () => {
  process.env.PIMLICO_API_KEY = "private-test-token";
  process.env.SEPOLIA_RPC_URL = "https://rpc.example.invalid";
  process.env.PIMLICO_SPONSORSHIP_POLICY_ID = "server-policy";
  let upstream = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("rate-limit-api")) return new Response(null, { status: 204 });
    const body = JSON.parse(String(init?.body));
    if (String(url).includes("api.pimlico.io")) {
      upstream++;
      assert.equal(body.params[3].sponsorshipPolicyId, "server-policy");
      return Response.json({ jsonrpc: "2.0", id: 1, error: { code: -1, message: "private-test-token", data: { detail: "https://api.pimlico.io/key/private-test-token" } } });
    }
    let result: string;
    if (body.method === "eth_getCode") result = "0x";
    else if (body.params[0].data.startsWith(encodeFunctionData({ abi: simpleFactoryAbi, functionName: "getAddress", args: [owner, 0n] }).slice(0, 10))) result = encodeFunctionResult({ abi: simpleFactoryAbi, functionName: "getAddress", result: sender });
    else result = encodeFunctionResult({ abi: nftFacetAbi, functionName: "mintFee", result: 0n });
    return Response.json({ jsonrpc: "2.0", id: body.id, result });
  };
  const response = await POST(request(call("pm_getPaymasterData")));
  assert.equal(response.status, 200);
  assert.equal(upstream, 1);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private-test-token|https:/);
  const bad = call("pm_getPaymasterData"); (bad.params[0] as Record<string, unknown>).sender = owner;
  assert.equal((await POST(request(bad))).status, 400);
  assert.equal(upstream, 1);
});
