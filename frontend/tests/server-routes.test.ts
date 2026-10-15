import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { uploadAsset } from "../src/lib/upload";
import { POST as upload } from "../src/app/api/upload/route";
import { POST as rpc } from "../src/app/api/rpc/route";
import { ipfsUrl, mediaUrl, MAX_NFT_IMAGE_BYTES } from "../src/lib/ipfs";

const originalFetch = globalThis.fetch;
const originalJWT = process.env.PINATA_JWT;
const originalRPC = process.env.SEPOLIA_RPC_URL;
let rateStatus: number;
const account = privateKeyToAccount(generatePrivateKey());
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT6sAAAAASUVORK5CYII=", "base64");
const cid = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3f7q4wz7xrb2k56pcj3w3x2gy";
let uploads: { body: FormData; authorization: string | null }[];

beforeEach(() => {
  process.env.PINATA_JWT = "test-only-pinata-token";
  process.env.SEPOLIA_RPC_URL = "https://rpc.example.invalid";
  uploads = [];
  rateStatus = 204;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("/.well-known/vercel/rate-limit-api/nft-upload")) {
      return new Response(null, { status: rateStatus });
    }
    if (String(input) === "https://uploads.pinata.cloud/v3/files") {
      uploads.push({ body: init?.body as FormData, authorization: new Headers(init?.headers).get("authorization") });
      return Response.json({ data: { cid } });
    }
    // Any other mocked RPC call.
    return Response.json({ jsonrpc: "2.0", id: 1, result: "0x00" });
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalJWT === undefined) delete process.env.PINATA_JWT; else process.env.PINATA_JWT = originalJWT;
  if (originalRPC === undefined) delete process.env.SEPOLIA_RPC_URL; else process.env.SEPOLIA_RPC_URL = originalRPC;
});

async function request(options: { kind?: "file" | "profile" | "artwork" | "document"; body?: Buffer; origin?: string } = {}) {
  const bytes = options.body || png;
  const kind = options.kind || "artwork";
  const body = new FormData();
  for (const [key, value] of Object.entries({ kind, name: "Test card", description: "Public test bio", address: account.address })) body.set(key, value);
  body.set("file", new File([new Uint8Array(bytes)], "test.png", { type: "image/png" }));
  return new Request("http://localhost:3000/api/upload", { method: "POST", headers: { Origin: options.origin || "http://localhost:3000" }, body });
}

test("rate-limited NFT upload without a wallet signature pins a public image and matching JSON; credentials stay server-side", async () => {
  const response = await upload(await request({ kind: "profile" }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.fileURI, `ipfs://${cid}`);
  assert.equal(result.metadataURI, `ipfs://${cid}`);
  assert.equal(uploads.length, 2);
  for (const call of uploads) {
    assert.equal(call.authorization, "Bearer test-only-pinata-token");
    assert.equal(call.body.get("network"), "public");
  }
  const metadata = JSON.parse(await (uploads[1].body.get("file") as File).text());
  assert.equal(metadata.image, result.fileURI);
  assert.equal(metadata.description, "Public test bio");
  assert.equal(metadata.attributes[0].value, "Profile");
  assert.equal(JSON.stringify(result).includes("test-only-pinata-token"), false);
});

test("standalone file uploads are rejected before calling Pinata", async () => {
  const response = await upload(await request({ kind: "file" }));
  assert.equal(response.status, 400);
  assert.equal(uploads.length, 0);
  assert.match((await response.json()).error, /only available when creating an NFT/);
});

test("rate-limited requests return 429 before using Pinata", async () => {
  rateStatus = 429;
  const response = await upload(await request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(uploads.length, 0);
});

test("an unpublished rate-limit rule fails closed", async () => {
  rateStatus = 404;
  const response = await upload(await request());
  assert.equal(response.status, 503);
  assert.equal(uploads.length, 0);
});

test("rate-limit provider failures never reach Pinata or leak diagnostics", async () => {
  globalThis.fetch = async () => { throw new Error("private rate-limit diagnostics"); };
  const response = await upload(await request());
  assert.equal(response.status, 503);
  assert.equal(uploads.length, 0);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private rate-limit diagnostics/);
});

test("a cross-origin request cannot spend the Pinata account quota", async () => {
  const response = await upload(await request({ origin: "https://another.example" }));
  assert.equal(response.status, 403);
  assert.equal(uploads.length, 0);
});

test("file content is checked independently from the browser MIME type", async () => {
  const response = await upload(await request({ body: Buffer.from("<html>not an image</html>") }));
  assert.equal(response.status, 400);
  assert.equal(uploads.length, 0);
});

test("oversized NFT uploads are rejected", async () => {
  const response = await upload(await request({ body: Buffer.alloc(MAX_NFT_IMAGE_BYTES + 1, 1) }));
  assert.equal(response.status, 400);
  assert.equal(uploads.length, 0);
});

test("missing Pinata configuration has an actionable error without exposing configuration", async () => {
  delete process.env.PINATA_JWT;
  const response = await upload(await request());
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /temporarily unavailable/);
});

test("an upstream Pinata failure cannot be mistaken for a successful mint-ready upload", async () => {
  globalThis.fetch = async (input) => String(input).includes("/.well-known/vercel/rate-limit-api/")
    ? new Response(null, { status: 204 }) : Response.json({ error: "private provider diagnostics" }, { status: 403 });
  const response = await upload(await request());
  assert.equal(response.status, 502);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private provider diagnostics|test-only-pinata-token/);
});

test("RPC proxy blocks signing, broadcasting, unknown networks and malformed input", async () => {
  for (const method of ["eth_sendRawTransaction", "personal_sign", "admin_peers"]) {
    const response = await rpc(new Request("http://localhost:3000/api/rpc?network=sepolia", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }) }));
    assert.equal(response.status, 400);
  }
  assert.equal((await rpc(new Request("http://localhost:3000/api/rpc?network=untrusted", { method: "POST", body: "{}" }))).status, 400);
});

test("RPC proxy preserves useful EVM revert data while removing upstream URLs", async () => {
  globalThis.fetch = async () => Response.json({ jsonrpc: "2.0", id: 1, error: { code: 3, message: "execution reverted at https://rpc.example.invalid/private-key", data: "0x1234" } });
  const response = await rpc(new Request("http://localhost:3000/api/rpc?network=sepolia", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: account.address }, "latest"] }) }));
  const result = await response.json();
  assert.equal(result.error.data, "0x1234");
  assert.doesNotMatch(result.error.message, /private-key|https:/);
});

test("gateway URL handling rejects executable URLs, traversal and malformed on-chain URIs", () => {
  assert.match(ipfsUrl(`ipfs://${cid}/avatar.png`), /\/ipfs\/bafy/);
  assert.throws(() => ipfsUrl("ipfs://not-a-cid"));
  assert.throws(() => ipfsUrl(`ipfs://${cid}/../secret`));
  assert.equal(mediaUrl("javascript:alert(1)"), null);
  assert.equal(mediaUrl("https://user:password@example.com/image.png"), null);
});

test("RPC methods with no params are normalized and forwarded", async () => {
  let forwarded: unknown;
  globalThis.fetch = async (_input, init) => { forwarded = JSON.parse(String(init?.body)); return Response.json({ jsonrpc: "2.0", id: 1, result: "0xaa36a7" }); };
  const response = await rpc(new Request("http://localhost:3000/api/rpc?network=sepolia", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId" }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(forwarded, { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });
});

test("malformed RPC JSON is a client error", async () => {
  const response = await rpc(new Request("http://localhost:3000/api/rpc?network=sepolia", { method: "POST", body: "not json" }));
  assert.equal(response.status, 400);
});

test("NFT/profile image limit is exactly 1,000,000 bytes", async () => {
  const exactLimit = Buffer.alloc(MAX_NFT_IMAGE_BYTES);
  png.copy(exactLimit);
  const accepted = await upload(await request({ body: exactLimit, kind: "profile" }));
  assert.equal(accepted.status, 200);
  const before = uploads.length;
  const tooLarge = Buffer.alloc(MAX_NFT_IMAGE_BYTES + 1);
  png.copy(tooLarge);
  for (const kind of ["artwork", "profile"] as const) {
    const rejected = await upload(await request({ body: tooLarge, kind }));
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).error, /1 MB/);
  }
  assert.equal(uploads.length, before);
});

test("the former larger standalone-file allowance cannot bypass NFT limits", async () => {
  const bytes = Buffer.alloc(MAX_NFT_IMAGE_BYTES + 1);
  png.copy(bytes);
  const response = await upload(await request({ body: bytes, kind: "file" }));
  assert.equal(response.status, 400);
  assert.equal(uploads.length, 0);
});

test("same-origin uploads work when Next's internal listener URL differs from the browser host", async () => {
  const original = await request();
  const response = await upload(new Request("http://0.0.0.0:3000/api/upload", { method: "POST", body: await original.formData(), headers: { Origin: "http://localhost:3000", Host: "localhost:3000", "X-Forwarded-Proto": "http" } }));
  assert.equal(response.status, 200);
  assert.equal(uploads.length, 2);
});


test("document NFTs pin the PDF, an image preview, and matching metadata", async () => {
  const response = await upload(await request({ kind: "document", body: Buffer.from("%PDF-1.4\nTest certificate") }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(uploads.length, 3);
  assert.equal((uploads[0].body.get("file") as File).type, "application/pdf");
  assert.equal((uploads[1].body.get("file") as File).type, "image/svg+xml");
  const metadata = JSON.parse(await (uploads[2].body.get("file") as File).text());
  assert.equal(metadata.image, result.imageURI);
  assert.equal(metadata.animation_url, result.fileURI);
  assert.equal(metadata.properties.mime_type, "application/pdf");
  assert.equal(metadata.attributes[0].value, "Document");
});

test("profile and image uploads cannot accept PDFs, and documents cannot accept images", async () => {
  for (const kind of ["profile", "artwork"] as const) {
    assert.equal((await upload(await request({ kind, body: Buffer.from("%PDF-1.4\nTest") }))).status, 400);
  }
  assert.equal((await upload(await request({ kind: "document" }))).status, 400);
  assert.equal(uploads.length, 0);
});


test("browser upload calls only the app server and never requests a wallet signature", async () => {
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    ++calls;
    assert.equal(input, "/api/upload");
    const form = init?.body as FormData;
    assert.equal(form.has("botToken"), false);
    assert.equal(form.has("signature"), false);
    assert.equal(form.has("timestamp"), false);
    return Response.json({ fileURI: `ipfs://${cid}`, imageURI: `ipfs://${cid}`, metadataURI: `ipfs://${cid}`, mimeType: "image/png", name: "Card" });
  };
  await uploadAsset({ file: new File([png], "card.png", { type: "image/png" }), kind: "artwork", name: "Card", description: "", address: account.address,
    phase: () => {} });
  assert.equal(calls, 1);
});


test("a firewall HTML 429 produces a useful client error", async () => {
  globalThis.fetch = async () => new Response("<html>rate limited</html>", { status: 429, headers: { "Content-Type": "text/html" } });
  await assert.rejects(uploadAsset({ file: new File([png], "card.png", { type: "image/png" }), kind: "artwork", name: "Card", description: "", address: account.address, phase: () => {} }), /Too many uploads/);
});
