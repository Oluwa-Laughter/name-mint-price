import { BaseError, formatUnits, type Address } from "viem";

export const explorer = "https://sepolia.etherscan.io";
export function shortAddress(address: Address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
export function eth(value: bigint) {
  if (value > BigInt(0) && value < BigInt(1_000_000_000_000)) return "<0.000001";
  const [whole, fraction] = formatUnits(value, 18).split(".");
  const trimmed = fraction?.slice(0, 6).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}
export function usd(value18: bigint) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(formatUnits(value18, 18)));
}
export function ageLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
export function explainError(error: unknown) {
  const raw = error instanceof BaseError ? error.shortMessage : error instanceof Error ? error.message : "Something went wrong. Please try again.";
  if (/rejected|denied|cancelled|canceled/i.test(raw)) return "Request cancelled in your wallet. Nothing was submitted. You can try again.";
  if (/provider.*not found/i.test(raw)) return "No browser wallet was found. Use a wallet extension or open this site inside your wallet’s browser.";
  if (/insufficient funds/i.test(raw)) return "Your wallet needs more Sepolia ETH to cover the payment and gas.";
  if (/EACUnauthorized|unauthori[sz]ed|not authori[sz]ed/i.test(raw)) return "This wallet does not have permission to edit this ENS record.";
  return raw.replace(/https?:\/\/\S+/g, "the network").slice(0, 400);
}
