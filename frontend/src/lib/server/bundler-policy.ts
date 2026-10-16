import { decodeFunctionData, isAddress, zeroAddress, type Address, type Hex } from "viem";
import { ENTRY_POINT, SIMPLE_FACTORY, SIMPLE_ACCOUNT_INDEX, simpleFactoryAbi, simpleOwnerAbi, ERC1967_IMPLEMENTATION_SLOT } from "../aa/constants";
import { validateBatchMintData } from "../aa/batch";
import { sepoliaContracts } from "../contracts";
import { serverSepoliaClient } from "./rpc";

const operationMethods = new Set(["eth_estimateUserOperationGas", "eth_sendUserOperation", "pm_getPaymasterStubData", "pm_getPaymasterData"]);
const readMethods = new Set(["eth_chainId", "eth_supportedEntryPoints", "pimlico_getUserOperationGasPrice", "eth_getUserOperationReceipt", "eth_getUserOperationByHash"]);
const quantity = /^0x[0-9a-f]+$/i;
export type BundlerCall = { jsonrpc: "2.0"; id: string | number | null; method: string; params: unknown[] };

export function parseBundlerCall(input: unknown): BundlerCall {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Send one JSON-RPC call at a time.");
  const c = input as Record<string, unknown>;
  if (c.jsonrpc !== "2.0" || !(typeof c.id === "number" || typeof c.id === "string" || c.id === null) || typeof c.method !== "string" || !Array.isArray(c.params)) throw new Error("Invalid JSON-RPC call.");
  if (!readMethods.has(c.method) && !operationMethods.has(c.method)) throw new Error("Unsupported smart-account method.");
  if (c.method === "eth_getUserOperationReceipt" || c.method === "eth_getUserOperationByHash") {
    if (c.params.length !== 1 || typeof c.params[0] !== "string" || !/^0x[0-9a-f]{64}$/i.test(c.params[0])) throw new Error("Invalid UserOperation hash.");
  } else if (readMethods.has(c.method) && c.params.length !== 0) throw new Error("This method takes no parameters.");
  return c as BundlerCall;
}

export function operationFromCall(call: BundlerCall) {
  if (!operationMethods.has(call.method)) return null;
  const [raw, entryPoint] = call.params;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof entryPoint !== "string" || entryPoint.toLowerCase() !== ENTRY_POINT.address.toLowerCase()) throw new Error("Only the Sepolia v0.7 EntryPoint is supported.");
  const op = raw as Record<string, unknown>;
  if (typeof op.sender !== "string" || !isAddress(op.sender) || op.sender === zeroAddress || typeof op.callData !== "string" || !/^0x[0-9a-f]*$/i.test(op.callData) || op.callData.length > 32_000) throw new Error("Invalid UserOperation.");
  if (op.eip7702Auth || op.authorization || op.initCode || op.paymasterAndData) throw new Error("Only the configured SimpleAccount v0.7 format is supported.");
  for (const field of ["nonce", "callGasLimit", "verificationGasLimit", "preVerificationGas", "maxFeePerGas", "maxPriorityFeePerGas", "paymasterVerificationGasLimit", "paymasterPostOpGasLimit"]) {
    const value = op[field];
    if (value === undefined) continue;
    if (typeof value !== "string" || !quantity.test(value) || value.length > 66) throw new Error("Invalid operation gas or nonce.");
    // Un-deployed SimpleAccount batches can require over 3M call gas and 1M verification gas.
    // Limit each field and their sum so real Pimlico estimates pass without unbounded sponsorship.
    if (field !== "nonce" && BigInt(value) > (field.includes("Fee") ? 10_000_000_000n : 5_000_000n)) throw new Error("The operation exceeds this app's gas limits.");
  }
  const totalGas = ["callGasLimit", "verificationGasLimit", "preVerificationGas", "paymasterVerificationGasLimit", "paymasterPostOpGasLimit"].reduce((sum, field) => sum + BigInt(op[field] as string || "0x0"), 0n);
  if (totalGas > 7_000_000n) throw new Error("The batch exceeds this app's total gas limit.");
  if (op.maxFeePerGas && op.maxPriorityFeePerGas && BigInt(op.maxPriorityFeePerGas as string) > BigInt(op.maxFeePerGas as string)) throw new Error("Invalid gas fees.");
  if (call.method.startsWith("pm_")) {
    if (call.params[2] !== "0xaa36a7") throw new Error("Only Sepolia sponsorship is supported.");
    // Only this server chooses the sponsorship policy. Ignore any client policy/context.
    const policy = process.env.PIMLICO_SPONSORSHIP_POLICY_ID;
    call.params = [op, ENTRY_POINT.address, "0xaa36a7", policy ? { sponsorshipPolicyId: policy } : {}];
  }
  const batch = validateBatchMintData(op.callData as Hex);
  return { op, batch };
}

/** Reject upgraded/malicious accounts even when their calldata looks like our mint batch. */
export async function validateCanonicalAccount(op: Record<string, unknown>, values: readonly bigint[]) {
  const client = serverSepoliaClient();
  const sender = op.sender as Address;
  const code = await client.getCode({ address: sender });
  let owner: Address;
  if (!code || code === "0x") {
    if (typeof op.factory !== "string" || op.factory.toLowerCase() !== SIMPLE_FACTORY.toLowerCase() || typeof op.factoryData !== "string") throw new Error("Use the supported SimpleAccount factory.");
    const creation = decodeFunctionData({ abi: simpleFactoryAbi, data: op.factoryData as Hex });
    if (creation.functionName !== "createAccount" || creation.args[1] !== SIMPLE_ACCOUNT_INDEX) throw new Error("Use this app's default smart account.");
    owner = creation.args[0];
  } else {
    owner = await client.readContract({ address: sender, abi: simpleOwnerAbi, functionName: "owner" });
    const [slot, implementation] = await Promise.all([
      client.getStorageAt({ address: sender, slot: ERC1967_IMPLEMENTATION_SLOT }),
      client.readContract({ address: SIMPLE_FACTORY, abi: simpleFactoryAbi, functionName: "accountImplementation" }),
    ]);
    if (!slot || slot.slice(-40).toLowerCase() !== implementation.slice(2).toLowerCase()) throw new Error("This smart-account implementation is not supported.");
  }
  const [expected, mintFee] = await Promise.all([
    client.readContract({ address: SIMPLE_FACTORY, abi: simpleFactoryAbi, functionName: "getAddress", args: [owner, SIMPLE_ACCOUNT_INDEX] }),
    client.readContract({ ...sepoliaContracts.classNFT, functionName: "mintFee" }),
  ]);
  if (expected.toLowerCase() !== sender.toLowerCase() || values.some((value) => value !== mintFee)) throw new Error("Smart account or mint fee does not match the current contract.");
}
