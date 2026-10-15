import type { Address } from "viem";
import { MAX_NFT_IMAGE_BYTES, imageTypes, type PinnedAsset, type UploadKind } from "./ipfs";

export async function uploadAsset(input: { file: File; kind: UploadKind; name: string; description: string; address: Address; phase: (message: string) => void }): Promise<PinnedAsset> {
  const { file, kind, address, phase } = input;
  const name = input.name.trim();
  const description = input.description.trim();
  const maxBytes = MAX_NFT_IMAGE_BYTES;
  if (!file.size || file.size > maxBytes) throw new Error("NFT files must be 1 MB (1,000,000 bytes) or smaller.");
  if (kind === "document" ? file.type !== "application/pdf" : !imageTypes.includes(file.type)) throw new Error(kind === "document" ? "Choose a PDF document." : "Choose a PNG, JPEG, WebP, or GIF image.");
  const body = new FormData();
  for (const [key, value] of Object.entries({ kind, name, description, address })) body.set(key, value);
  body.set("file", file);
  phase("Uploading your NFT file…");
  const response = await fetch("/api/upload", { method: "POST", body, signal: AbortSignal.timeout(58_000) });
  if (response.status === 429) throw new Error("Too many uploads. Please wait a minute and try again.");
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Uploads are temporarily unavailable. Please retry later.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Upload failed. Please try again.");
  return result;
}
