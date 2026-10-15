# NFT upload protection

The server calls `checkRateLimit("nft-upload", { request })` before uploading to Pinata. Only the server makes this call; no browser signature, CAPTCHA, or additional API key is required. Vercel supplies the client IP. Local development uses the dedicated `local-development` bucket against `name-and-mint.vercel.app`.

The app returns 503 when the rule is unpublished, missing, or its check fails. A limited request returns 429 before any Pinata upload. The browser displays a retry message even if a firewall response is HTML. The file-size and content checks still apply.

## Current draft

Project: `isaacs-projects-6399c596/name-and-mint`.

- Rule name: `NFT upload limit`
- Rule ID: `rule_nft_upload_limit_8xWCIM`
- Match: Rate Limit API ID equals `nft-upload`
- Initial observation policy: 30 requests per 60 seconds per IP, exceeded requests logged.
- Recommended enforced policy after reviewing traffic: 3 requests per 60 seconds per IP, exceeded requests return 429.

The draft is separate from a Git deployment. Publishing observation mode enables uploads and records traffic; it does not enforce the proposed 3/minute limit.

From this folder, inspect and publish the reviewed observation draft:

```sh
vercel firewall diff --project name-and-mint --scope isaacs-projects-6399c596
vercel firewall publish --yes --project name-and-mint --scope isaacs-projects-6399c596
```

Review the [matching firewall traffic](https://vercel.com/isaacs-projects-6399c596/name-and-mint/firewall/traffic?filter=rule_nft_upload_limit_8xWCIM). Before enforcing in production, test the desired policy in preview and check that legitimate users are unaffected. Keep production observation active during preview testing where your plan's rule limits permit it. A preview-only rule with this ID leaves production uploads unavailable if no production rule matches, because the app rejects missing protection.

After that review, stage the enforced policy:

```sh
vercel firewall rules edit "NFT upload limit" \
  --rate-limit-requests 3 --rate-limit-action rate_limit \
  --yes --project name-and-mint --scope isaacs-projects-6399c596
vercel firewall diff --project name-and-mint --scope isaacs-projects-6399c596
```

Publish after reviewing the changes. To roll enforcement back while investigating legitimate users being limited, change the rate-limit action to `log` and publish that reviewed change.

Counters are per Vercel region, not a global account-wide quota. Shared networks can put several users in one IP bucket, while attackers using different IPs can evade a per-IP limit. Changing the configured policy affects the next checks without rebuilding the frontend.

Documentation: [Vercel rate-limiting SDK](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk).
