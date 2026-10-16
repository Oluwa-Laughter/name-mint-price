import { parseBundlerCall, operationFromCall, validateCanonicalAccount } from "@/lib/server/bundler-policy";
import { enforceUploadRateLimit } from "@/lib/server/upload-rate-limit";

export const maxDuration = 60;
export async function GET() {
  return Response.json({ configured: Boolean(process.env.PIMLICO_API_KEY) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const key = process.env.PIMLICO_API_KEY;
  if (!key) return Response.json({ error: "Smart-account service is temporarily unavailable." }, { status: 503 });
  const url = new URL(request.url);
  const expected = `${request.headers.get("x-forwarded-proto") || url.protocol.slice(0, -1)}://${request.headers.get("host") || url.host}`;
  if (request.headers.get("origin") !== expected) return Response.json({ error: "Use the smart-account page in this app." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 64_000) return Response.json({ error: "Request too large." }, { status: 413 });
  let call;
  try {
    const text = await request.text();
    if (text.length > 64_000) return Response.json({ error: "Request too large." }, { status: 413 });
    call = parseBundlerCall(JSON.parse(text));
    const operation = operationFromCall(call);
    if (operation) {
      await validateCanonicalAccount(operation.op, operation.batch.values);
      // One final sponsorship plus one submission, rather than every polling/estimation request.
      if (call.method === "pm_getPaymasterData" || call.method === "eth_sendUserOperation") {
        const limited = await enforceUploadRateLimit(request, "smart-account requests");
        if (limited) return limited;
      }
    }
  } catch {
    return Response.json({ error: "Only valid two-mint batches from this app's smart accounts are accepted." }, { status: 400 });
  }
  try {
    const response = await fetch(`https://api.pimlico.io/v2/11155111/rpc?apikey=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(call),
      signal: AbortSignal.timeout(35_000), cache: "no-store",
    });
    if (!response.ok) throw new Error("Provider unavailable");
    const data: unknown = await response.json();
    const clean = (value: unknown): unknown => {
      if (typeof value === "string") return value.replaceAll(key, "[redacted]").replace(/https?:\/\/[^\s"<>]+/g, "[provider]");
      if (Array.isArray(value)) return value.map(clean);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
      return value;
    };
    return Response.json(clean(data), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Smart-account service is temporarily unavailable. Retry checking an existing operation before submitting again." }, { status: 502 });
  }
}
