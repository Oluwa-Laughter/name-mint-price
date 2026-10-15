import { enforceUploadRateLimit } from "@/lib/server/upload-rate-limit";
import { isAddress } from "viem";
import { MAX_NFT_IMAGE_BYTES, imageTypes, type UploadKind } from "@/lib/ipfs";

export const maxDuration = 60;

function contentType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (Buffer.from(bytes.slice(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  const prefix = Buffer.from(bytes.slice(0, 16)).toString("ascii");
  if (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a")) return "image/gif";
  if (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP") return "image/webp";
  if (prefix.startsWith("%PDF-")) return "application/pdf";
  return null;
}
async function pin(file: File, name: string, jwt: string) {
  const body = new FormData();
  body.set("network", "public");
  body.set("file", file);
  body.set("name", name);
  body.set("cid_version", "v1");
  const response = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body, signal: AbortSignal.timeout(22_000),
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? "Upload service is temporarily unavailable. Please try again later."
    : "Upload service could not complete the upload. Please retry.");
  const result = await response.json();
  const cid = result?.data?.cid;
  if (typeof cid !== "string" || !/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/.test(cid)) throw new Error("Upload service returned an invalid file reference.");
  return `ipfs://${cid}`;
}
export async function GET() {
  return Response.json({ configured: Boolean(process.env.PINATA_JWT), maxFileBytes: MAX_NFT_IMAGE_BYTES }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return Response.json({ error: "Uploads are temporarily unavailable. Please try again later." }, { status: 503 });
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const protocol = request.headers.get("x-forwarded-proto") || url.protocol.slice(0, -1);
  const expectedOrigin = `${protocol}://${request.headers.get("host") || url.host}`;
  if (!origin || origin !== expectedOrigin) return Response.json({ error: "Upload from this app's page." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > MAX_NFT_IMAGE_BYTES + 32_000) return Response.json({ error: "NFT files must be 1 MB (1,000,000 bytes) or smaller." }, { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    const address = String(form.get("address") || "");
    const kind = String(form.get("kind")) as UploadKind;
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    if (!["artwork", "profile", "document"].includes(kind)) return Response.json({ error: "Uploads are only available when creating an NFT." }, { status: 400 });
    const maxBytes = MAX_NFT_IMAGE_BYTES;
    if (!(file instanceof File) || !file.size || file.size > maxBytes) return Response.json({ error: "NFT files must be 1 MB (1,000,000 bytes) or smaller." }, { status: 400 });
    if (!name || name.length > 80 || description.length > 1000) return Response.json({ error: "Use a name up to 80 characters and a description up to 1,000 characters." }, { status: 400 });
    if (!isAddress(address)) return Response.json({ error: "Connect a wallet to mint." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = contentType(bytes);
    if (!mimeType || (kind === "document" ? mimeType !== "application/pdf" : !imageTypes.includes(mimeType))) return Response.json({ error: kind === "document" ? "Choose a PDF document." : "NFT pictures must be PNG, JPEG, WebP, or GIF images." }, { status: 400 });
    const limited = await enforceUploadRateLimit(request);
    if (limited) return limited;
    const fileURI = await pin(new File([bytes], file.name, { type: mimeType }), name, jwt);
    let imageURI = fileURI;
    if (kind === "document") {
      // A generated preview gives document NFTs a standard image field. User-supplied SVG uploads stay disabled.
      const cover = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#f5f8f6"/><rect x="175" y="110" width="250" height="340" rx="12" fill="white" stroke="#176345" stroke-width="8"/><path d="M220 210h160M220 260h160M220 310h110" stroke="#176345" stroke-width="10" stroke-linecap="round"/><text x="300" y="510" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#176345">PDF document</text></svg>';
      imageURI = await pin(new File([cover], "document-preview.svg", { type: "image/svg+xml" }), `${name} preview`, jwt);
    }
    const metadata = {
      name, description, image: imageURI,
      ...(kind === "document" ? { animation_url: fileURI, properties: { file: fileURI, mime_type: mimeType } } : {}),
      attributes: [{ trait_type: "Kind", value: kind === "profile" ? "Profile" : kind === "document" ? "Document" : "Artwork" }],
    };
    let metadataURI: string;
    try { metadataURI = await pin(new File([JSON.stringify(metadata)], "metadata.json", { type: "application/json" }), `${name} metadata`, jwt); }
    catch { return Response.json({ error: "Your file was uploaded, but NFT details could not be saved. Please retry.", fileURI }, { status: 502 }); }
    return Response.json({ fileURI, imageURI, metadataURI, mimeType, name });
  } catch (error) {
    // Do not expose provider responses, headers, JWTs, or RPC configuration.
    const message = error instanceof Error && error.message.startsWith("Upload service ") ? error.message : "Upload failed. Check your connection and try again.";
    return Response.json({ error: message }, { status: 502 });
  }
}
