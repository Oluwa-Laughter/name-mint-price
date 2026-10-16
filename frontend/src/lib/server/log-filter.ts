import { toEventSelector } from "viem";
import { CLASSNFT_ADDRESS } from "../contracts";
export const MINT_TOPIC = toEventSelector("NFTMinted(uint256,address,address,string,string,uint256)");
/** Bound public polling to this app's mint events and a small explicit block range. */
export function validMintLogFilter(params: unknown, network: string) {
  if (network !== "sepolia" || !Array.isArray(params) || params.length !== 1) return false;
  const filter = params[0];
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return false;
  if (Object.keys(filter).some((key) => !["address", "topics", "fromBlock", "toBlock"].includes(key))) return false;
  if (typeof filter.address !== "string" || filter.address.toLowerCase() !== CLASSNFT_ADDRESS.toLowerCase()) return false;
  if (!Array.isArray(filter.topics) || filter.topics.length !== 1 || typeof filter.topics[0] !== "string" || filter.topics[0].toLowerCase() !== MINT_TOPIC.toLowerCase()) return false;
  if (typeof filter.fromBlock !== "string" || typeof filter.toBlock !== "string" || !/^0x[\da-f]{1,16}$/i.test(filter.fromBlock) || !/^0x[\da-f]{1,16}$/i.test(filter.toBlock)) return false;
  const from = BigInt(filter.fromBlock), to = BigInt(filter.toBlock);
  return from <= to && to - from < 500n;
}
