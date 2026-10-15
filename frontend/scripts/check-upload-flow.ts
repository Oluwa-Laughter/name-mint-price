import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { uploadMessage, ipfsUrl } from "../src/lib/ipfs";

async function main() {
  const base = process.env.APP_URL || "http://localhost:3000";
  const account = privateKeyToAccount(generatePrivateKey());
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT6sAAAAASUVORK5CYII=", "base64");
  const input = { origin: new URL(base).origin, address: account.address, digest: createHash("sha256").update(bytes).digest("hex"), kind: "artwork" as const, name: "Name & Mint upload check", description: "Test image used to verify server-side Pinata integration.", timestamp: Date.now() };
  const signature = await account.signMessage({ message: uploadMessage(input) });
  const body = new FormData();
  for (const [key, value] of Object.entries({ address: input.address, kind: input.kind, name: input.name, description: input.description, timestamp: String(input.timestamp), signature })) body.set(key, value);
  body.set("file", new File([new Uint8Array(bytes)], "upload-check.png", { type: "image/png" }));
  const response = await fetch(`${base}/api/upload`, { method: "POST", headers: { Origin: input.origin }, body, signal: AbortSignal.timeout(60_000) });
  const result = await response.json();
  assert.equal(response.status, 200, result.error || "Server upload failed");
  assert(result.fileURI?.startsWith("ipfs://") && result.metadataURI?.startsWith("ipfs://"));
  console.log("Live server upload passed: signature verified; image and metadata pinned to public IPFS");
  console.log("Image:", result.fileURI);
  console.log("Metadata:", result.metadataURI);
  const metadata = await fetch(ipfsUrl(result.metadataURI), { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30_000) });
  assert.equal(metadata.status, 200, "Pinned metadata could not be read through the gateway");
  assert.equal((await metadata.json()).image, result.fileURI);
  const image = await fetch(ipfsUrl(result.fileURI), { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30_000) });
  assert.equal(image.status, 200, "Pinned image could not be read through the gateway");
  assert.match(image.headers.get("content-type") || "", /image/);
  console.log("Gateway readback passed: metadata points to the pinned image and the image is retrievable");
  console.log("No NFT mint or on-chain transaction was sent.");
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Upload check failed"); process.exitCode = 1; });
