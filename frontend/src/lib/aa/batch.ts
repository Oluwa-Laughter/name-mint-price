import { decodeFunctionData, encodeFunctionData, isAddress, zeroAddress, type Address, type Hex } from "viem";
import { nftFacetAbi, CLASSNFT_ADDRESS } from "../contracts";
import { simpleBatchAbi } from "./constants";

export type BatchMintInput = { recipients: readonly [Address, Address]; metadataURI: string; imageURI: string; mintFee: bigint };
export function buildBatchMintCalls(input: BatchMintInput) {
  return input.recipients.map((recipient) => ({
    to: CLASSNFT_ADDRESS, value: input.mintFee,
    data: encodeFunctionData({ abi: nftFacetAbi, functionName: "mint", args: [recipient, input.metadataURI, input.imageURI] }),
  }));
}
function validURI(value: string) {
  return value.length <= 512 && /^ipfs:\/\/(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})(?:\/[a-zA-Z0-9._~-]+)*$/.test(value) && !value.split("/").some((part) => part === "." || part === "..");
}
/** Only an exact two-mint batch to our deployed Diamond is eligible for the proxy. */
export function validateBatchMintData(callData: Hex) {
  const decoded = decodeFunctionData({ abi: simpleBatchAbi, data: callData });
  const [targets, values, payloads] = decoded.args;
  if (targets.length !== 2 || values.length !== 2 || payloads.length !== 2) throw new Error("The batch must contain exactly two NFT mints.");
  if (encodeFunctionData({ abi: simpleBatchAbi, functionName: "executeBatch", args: decoded.args }).toLowerCase() !== callData.toLowerCase()) throw new Error("Invalid batch encoding.");
  const recipients: Address[] = [];
  for (let i = 0; i < 2; ++i) {
    if (targets[i].toLowerCase() !== CLASSNFT_ADDRESS.toLowerCase()) throw new Error("Only this app's NFT contract is supported.");
    const mint = decodeFunctionData({ abi: nftFacetAbi, data: payloads[i] });
    if (mint.functionName !== "mint") throw new Error("Only NFT mint calls are supported.");
    const [recipient, metadataURI, imageURI] = mint.args;
    if (!isAddress(recipient) || recipient === zeroAddress || !validURI(metadataURI) || !validURI(imageURI)) throw new Error("Invalid mint recipient or file reference.");
    recipients.push(recipient);
  }
  return { recipients, values };
}
