import { checkRateLimit } from "@vercel/firewall";

/** Shared Vercel counters. Missing rules and provider errors never permit a Pinata upload. */
export async function enforceUploadRateLimit(request: Request): Promise<Response | null> {
  try {
    const result = await checkRateLimit("nft-upload", {
      request, timeout: 4000,
      // Local development shares a dedicated bucket against this project's firewall.
      firewallHostForDevelopment: "name-and-mint.vercel.app",
      ...(process.env.NODE_ENV !== "production" ? { rateLimitKey: "local-development" } : {}),
    });
    if (result.error === "not-found") throw new Error("Upload rule is not active");
    if (result.rateLimited || result.error === "blocked") {
      return Response.json({ error: "Too many uploads. Please wait a minute and try again." }, {
        status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      });
    }
    return null;
  } catch {
    return Response.json({ error: "Uploads are temporarily unavailable. Please try again later." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
