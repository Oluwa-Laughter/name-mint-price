import type { Address, Hex } from "viem";
import { MAX_NFT_IMAGE_BYTES, imageTypes, uploadMessage, type PinnedAsset, type UploadKind } from "./ipfs";

export async function uploadAsset(input: { file: File; kind: UploadKind; name: string; description: string; address: Address; sign: (message: string) => Promise<Hex>; phase: (message: string) => void }): Promise<PinnedAsset> {
  const { file, kind, address, sign, phase } = input;
  const name = input.name.trim();
  const description = input.description.trim();
  const maxBytes = MAX_NFT_IMAGE_BYTES;
  if (!file.size || file.size > maxBytes) throw new Error("NFT files must be 1 MB (1,000,000 bytes) or smaller.");
  if (kind === "document" ? file.type !== "application/pdf" : !imageTypes.includes(file.type)) throw new Error(kind === "document" ? "Choose a PDF document." : "Choose a PNG, JPEG, WebP, or GIF image.");
  const digestBytes = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const digest = Array.from(new Uint8Array(digestBytes), (b) => b.toString(16).padStart(2, "0")).join("");
  const timestamp = Date.now();
  phase("Sign the upload request in your wallet. This signature costs no gas.");
  const signature = await sign(uploadMessage({ origin: window.location.origin, address, digest, kind, name, description, timestamp }));
  const body = new FormData();
  for (const [key, value] of Object.entries({ kind, name, description, address, timestamp: String(timestamp), signature })) body.set(key, value);
  body.set("file", file);
  phase("Uploading your NFT file…");
  const response = await fetch("/api/upload", { method: "POST", body, signal: AbortSignal.timeout(58_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Upload failed. Please try again.");
  return result;
}
