import { rpcEndpoint } from "@/lib/server/rpc";

const methods = new Set([
  "eth_chainId", "eth_blockNumber", "eth_call", "eth_getBalance", "eth_getCode",
  "eth_estimateGas", "eth_getBlockByNumber", "eth_getBlockByHash", "eth_getTransactionCount",
  "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory",
]);

export async function POST(request: Request) {
  const network = new URL(request.url).searchParams.get("network");
  if (network !== "sepolia" && network !== "mainnet") return Response.json({ error: "Unknown network." }, { status: 400 });
  if (Number(request.headers.get("content-length") || 0) > 64_000) return new Response("Request too large", { status: 413 });
  try {
    const text = await request.text();
    if (text.length > 64_000) return new Response("Request too large", { status: 413 });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON request." }, { status: 400 }); }
    const calls = Array.isArray(body) ? body : [body];
    if (!calls.length || calls.length > 20 || calls.some((call) => !call || typeof call !== "object" || !methods.has(call.method) || (call.params !== undefined && !Array.isArray(call.params)))) {
      return Response.json({ error: "Only supported read and simulation methods are allowed." }, { status: 400 });
    }
    const payload = calls.map(({ id, method, params }) => ({ jsonrpc: "2.0", id, method, params: params || [] }));
    const response = await fetch(rpcEndpoint(network), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Array.isArray(body) ? payload : payload[0]),
      signal: AbortSignal.timeout(22_000), cache: "no-store",
    });
    if (!response.ok) throw new Error("RPC unavailable");
    const result = await response.json();
    // Preserve EVM error data for simulation/permission checks, never provider URLs.
    for (const item of Array.isArray(result) ? result : [result]) {
      if (item?.error?.message) item.error.message = String(item.error.message).replace(/https?:\/\/\S+/g, "[RPC]").slice(0, 500);
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The network is temporarily unavailable. Please retry." }, { status: 502 });
  }
}
