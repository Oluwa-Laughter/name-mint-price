import { parseAbi } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";

export const ENTRY_POINT = { address: entryPoint07Address, version: "0.7" } as const;
export const SIMPLE_FACTORY = "0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985" as const;
export const SIMPLE_ACCOUNT_INDEX = 0n;
export const simpleBatchAbi = parseAbi(["function executeBatch(address[] dest, uint256[] value, bytes[] func)"]);
export const simpleFactoryAbi = parseAbi([
  "function createAccount(address owner,uint256 salt) returns (address)",
  "function getAddress(address owner,uint256 salt) view returns (address)",
  "function accountImplementation() view returns (address)",
]);
export const simpleOwnerAbi = parseAbi(["function owner() view returns (address)"]);
export const ERC1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
