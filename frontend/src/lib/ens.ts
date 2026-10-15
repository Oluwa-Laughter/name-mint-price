import { getAddress, isAddress, type Address } from "viem";
import { normalize } from "viem/ens";
import { ensClient, type EnsNetwork } from "./clients";

export async function verifiedEnsName(address: Address, network: EnsNetwork = "sepolia") {
  const client = ensClient(network);
  const name = await client.getEnsName({ address });
  if (!name) return null;
  const forward = await client.getEnsAddress({ name: normalize(name) });
  return forward?.toLowerCase() === address.toLowerCase() ? name : null;
}
export async function resolveRecipient(input: string): Promise<Address> {
  if (isAddress(input.trim())) return getAddress(input.trim());
  const name = normalize(input.trim());
  if (!name.endsWith(".eth")) throw new Error("Enter an Ethereum address or a Sepolia .eth name.");
  const address = await ensClient("sepolia").getEnsAddress({ name });
  if (!address || /^0x0{40}$/i.test(address)) throw new Error("This name has no Sepolia address record. Check the name and ENS network.");
  return address;
}
export async function lookupEns(input: string, network: EnsNetwork) {
  const client = ensClient(network);
  const value = input.trim();
  let address: Address | null;
  let knownResolver: Address | null | undefined;
  let name: string | null;
  if (isAddress(value)) {
    address = getAddress(value);
    name = await verifiedEnsName(address, network);
  } else {
    name = normalize(value);
    if (!name.endsWith(".eth")) throw new Error("Enter a .eth name or a valid Ethereum address.");
    const resolved = await client.getEnsAddress({ name });
    address = resolved && !/^0x0{40}$/i.test(resolved) ? resolved : null;
    if (!address) {
      knownResolver = await client.getEnsResolver({ name });
      if (!knownResolver) throw new Error(`No resolver found on ${network === "sepolia" ? "Sepolia" : "Ethereum mainnet"}. Names on the two networks are separate.`);
    }
  }
  const [balance, avatar, description, twitter, resolver] = await Promise.allSettled([
    address ? client.getBalance({ address }) : Promise.resolve(null),
    name ? client.getEnsAvatar({ name }) : Promise.resolve(null),
    name ? client.getEnsText({ name, key: "description" }) : Promise.resolve(null),
    name ? client.getEnsText({ name, key: "com.twitter" }) : Promise.resolve(null),
    knownResolver !== undefined ? Promise.resolve(knownResolver) : name ? client.getEnsResolver({ name }) : Promise.resolve(null),
  ]);
  return {
    network, address, name,
    balance: balance.status === "fulfilled" ? balance.value : null,
    avatar: avatar.status === "fulfilled" ? avatar.value : null,
    description: description.status === "fulfilled" ? description.value : null,
    twitter: twitter.status === "fulfilled" ? twitter.value : null,
    resolver: resolver.status === "fulfilled" ? resolver.value : null,
    partial: [balance, avatar, description, twitter, resolver].some((result) => result.status === "rejected"),
  };
}
export type EnsResult = Awaited<ReturnType<typeof lookupEns>>;
