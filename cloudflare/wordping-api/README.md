# wordping-api

The AI proxy for WordPing. It exists so the OpenAI key never ships inside the
Expo bundle, and so a paid API cannot be used by anyone who does not hold a
verified RevenueCat entitlement.

It stores no user data. Words, folders and review history live only on the
device, in SQLite. Nothing here persists anything except rate/quota counters,
short-lived entitlement results, and fixed cached voice previews.

## Endpoints

All AI endpoints are `POST`, `Content-Type: application/json`, and require two
headers:

```
X-WordPing-Install-Id     random per-install UUID from expo-secure-store
X-WordPing-App-User-Id    the RevenueCat App User ID
```

Neither header is authentication. The install id only spreads rate-limit
buckets; the App User ID is looked up against RevenueCat's server API on every
request that is not answered from a short cache.

| Route | Requires | Request | Response |
|---|---|---|---|
| `POST /v1/voice/card` | Basic | `{ text, voice, format? }` | `audio/wav` or `audio/mpeg` |
| `POST /v1/voice/sample` | Basic | `{ voice, sampleVersion? }` | `audio/wav` |
| `POST /v1/voice/promo` | — (free) | `{ sample, langCode?, sampleVersion? }` | `audio/wav` |
| `POST /v1/voice/custom` | Premium | `{ text, voice, format?, instructions? }` | `audio/wav` or `audio/mpeg` |
| `POST /v1/meaning` | Premium | `{ text, langCode? }` | `{ text }` |
| `POST /v1/breakdown` | Premium | `{ text, langCode? }` | `{ text }` |
| `POST /v1/translate` | Premium | `{ text, langCode? }` | `{ text }` |
| `POST /v1/examples` | Premium | `{ text, langCode? }` | `{ text }` |
| `GET /v1/health` | — | — | `{ ok, requestId, ...Configured }` |

Unknown body fields are stripped, never forwarded. There is no code path that
reads a model name, an upstream URL, or a plan flag out of a request.

### High-Quality AI Voice allowance

- Free: the two fixed Upgrade Plan samples only; arbitrary word-card voice is blocked.
- Basic: 200 new word-card generations per UTC month.
- Premium: no monthly quota; 20/minute and 300/day abuse limits apply.
- Cached playback never counts.
- Voice-picker previews never consume monthly quota, including a cache miss.

### Errors

Every failure is `{ "error": "<code>", "requestId": "<uuid>", ... }`. Stack
traces and upstream messages are never returned.

| Code | Status | Meaning |
|---|---|---|
| `invalid_request` | 400 | Body failed schema validation |
| `invalid_voice` | 400 | Voice is not on the server allowlist |
| `input_too_long` | 400 | Over the caller's per-request character cap |
| `payload_too_large` | 413 | Body exceeds 16 KB |
| `unsupported_media_type` | 415 | Content-Type is not JSON |
| `missing_install_id` | 400 | Identity headers absent or malformed |
| `subscription_required` | 403 | Verified, but the tier is insufficient |
| `rate_limit_exceeded` | 429 | Per-minute or per-day request budget |
| `usage_limit_exceeded` | 429 | Per-day character budget |
| `quota_exceeded` | 429 | OpenAI throttled us, not the caller |
| `feature_disabled` | 503 | Operator kill switch |
| `entitlement_service_unavailable` | 503 | RevenueCat unreachable — fails closed |
| `upstream_failed` | 502 | OpenAI returned an error |
| `request_timeout` | 504 | Upstream exceeded the timeout |
| `internal_error` | 500 | Anything else |

429 responses carry `Retry-After`.

## Local development

```bash
cd cloudflare/wordping-api
npm install
cp .dev.vars.example .dev.vars    # then fill in real values
npx wrangler dev                  # http://127.0.0.1:8787
```

Point the app at it with `EXPO_PUBLIC_WORDPING_API_BASE_URL=http://127.0.0.1:8787`.

To work on the app without a RevenueCat account, set `DEV_BYPASS_ENTITLEMENTS=1`
in `.dev.vars`. It is honoured **only** when the request arrives over localhost;
a deployed Worker logs `dev_bypass_ignored_in_deployment` and ignores it.

```bash
npm test          # 57 tests: validation, allowlists, entitlements, limits
npm run typecheck
```

## Deployment

One-time setup:

```bash
cd cloudflare/wordping-api
npm install

# Create the KV namespace and paste both ids into wrangler.toml.
npx wrangler kv namespace create WORDPING_KV
npx wrangler kv namespace create WORDPING_KV --preview

npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put REVENUECAT_SECRET_API_KEY
npx wrangler secret put RATE_LIMIT_SALT      # any long random string
```

Then, for every release:

```bash
npx wrangler deploy
```

Verify:

```bash
curl -s https://wordping-api.<subdomain>.workers.dev/v1/health
# {"ok":true,...,"openAIKeyConfigured":true,"revenueCatKeyConfigured":true,"rateLimitSaltConfigured":true}
```

`RATE_LIMIT_SALT` is optional but should always be set in production: without it
the identity hashes used as KV keys are unsalted and therefore brute-forceable
by anyone who can read the namespace.

## Operating it

Kill switches and limits live in KV and take effect within about a minute, with
no redeploy and no new mobile build.

```bash
# Turn one feature off.
npx wrangler kv key put --binding=WORDPING_KV config:killswitch '{"voice_custom":true}'

# Turn everything back on.
npx wrangler kv key delete --binding=WORDPING_KV config:killswitch

# Tighten a budget.
npx wrangler kv key put --binding=WORDPING_KV config:limits \
  '{"voice_card":{"premium":{"maxRequestsPerDay":50,"maxCharsPerDay":10000}}}'
```

A malformed value in either key is logged and ignored rather than failing
requests. Setting a limit to `0` revokes that feature for that tier.

See `docs/COST_CONTROLS.md` for OpenAI budgets and alerts.

## Known limitation: KV counters

KV is eventually consistent and has no atomic increment, so the rate-limit
counters are read-modify-write. A burst of genuinely concurrent requests can
overshoot a limit by roughly one request per Cloudflare colo before the write
propagates. That is acceptable here — entitlement verification is the real
gate, and the OpenAI project budget is the hard ceiling. If exact limits ever
become necessary, move `consume` in `src/ratelimit.ts` to a Durable Object keyed
by `bucketKey`; the interface is shaped to allow that swap without touching the
routes.
