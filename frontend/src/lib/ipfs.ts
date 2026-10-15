export const MAX_NFT_IMAGE_BYTES = 1_000_000;
export const PUBLIC_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://emerald-added-meerkat-121.mypinata.cloud";
export const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function ipfsUrl(uri: string) {
  if (!uri.startsWith("ipfs://")) throw new Error("The file link is invalid.");
  const path = uri.slice(7).replace(/^ipfs\//, "");
  const [cid, ...segments] = path.split("/");
  if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/.test(cid) || segments.some((part) => part === "." || part === "..")) {
    throw new Error("The file link is invalid.");
  }
  const base = new URL(PUBLIC_GATEWAY.startsWith("https://") ? PUBLIC_GATEWAY : `https://${PUBLIC_GATEWAY}`);
  if (base.protocol !== "https:" || base.username || base.password || base.search) throw new Error("File viewing is temporarily unavailable.");
  return `${base.origin}/ipfs/${[cid, ...segments].map(encodeURIComponent).join("/")}`;
}
export function mediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    if (value.startsWith("ipfs://")) return ipfsUrl(value);
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export type UploadKind = "artwork" | "profile" | "document";
export type PinnedAsset = { fileURI: string; metadataURI: string; imageURI: string; mimeType: string; name: string };
