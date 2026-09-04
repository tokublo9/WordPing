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

### Manually view the Basic monthly-limit UI

This uses one ignored machine-local file and no real credentials. In
`cloudflare/wordping-api/.dev.vars`, set:

```dotenv
OPENAI_API_KEY="local-mock-not-used"
REVENUECAT_SECRET_API_KEY="local-mock-not-used"
RATE_LIMIT_SALT="wordping-local-ai-voice"
DEV_BYPASS_ENTITLEMENTS="0"
LOCAL_AI_VOICE_TEST_SCENARIO="local_ai_voice"
```

The scenario is accepted only on a loopback request. It reports a mocked Premium
entitlement — the tier High-Quality AI Voice belongs to — and replaces every
OpenAI upstream with a deterministic local response. It no longer seeds a monthly
quota counter: AI Voice is Premium and Premium is sold as included, so no tier is
metered and there is no exhaustion response to exercise. The app discovers this
contract from `/v1/health`, uses a fixed local RevenueCat-shaped identity without
initializing the RevenueCat SDK, disables background voice preloads, and sends a
normal `/v1/voice/card` request when the voice button is tapped.

Start the Worker with disposable local-only KV storage:

```bash
cd /Users/tokumoto/Documents/WordPing/cloudflare/wordping-api
nvm use 20
npm run dev:local-ai-voice
```

In a second terminal, verify the safety contract:

```bash
curl -sS http://127.0.0.1:8787/v1/health
```

The JSON must contain all four values below before starting the app:

```json
{
  "localAiVoiceTestScenario": "local_ai_voice",
  "entitlement": "mock-premium",
  "upstreamsMocked": true,
  "storage": "isolated-local-kv"
}
```

In the repository root, create or edit the already-gitignored `.env.local`:

```dotenv
EXPO_PUBLIC_WORDPING_API_BASE_URL=http://127.0.0.1:8787
```

Then restart Expo so it embeds the local URL:

```bash
cd /Users/tokumoto/Documents/WordPing
npx expo start --clear --ios
```

Open the iOS development app, open any word card, and tap its AI Voice button.
The local scenario bypasses cache reads without deleting cached files, so this
tap reaches the Worker and receives the production-shaped response:

```json
{
  "error": "monthly_api_limit_reached",
  "limit": 200,
  "used": 200,
  "tier": "basic"
}
```

The response status is 429. No audio generation starts. The Basic monthly-limit
alert offers the existing Premium upgrade path; dismissing it leaves the app
usable. As an optional second check, tap 11 times within the same UTC minute:
the 11th request reaches the normal Basic short-term throttle and shows the
retry-later message with no upgrade action.

Stop the Worker with Ctrl-C. The launcher removes its temporary KV directory.
For normal development, remove `LOCAL_AI_VOICE_TEST_SCENARIO` (or set it to an
empty string), restore the usual API URL in `.env.local`, and restart the Worker
and Expo. No production KV, RevenueCat customer, OpenAI account, SQLite database,
or on-device audio cache is modified by the scenario.

```bash
npm test          # 124 isolated Worker tests
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

Check that `version` matches `WORKER_VERSION` in `src/version.ts`. **Bump that
constant in the same commit as any behaviour change** — the promo previews were
broken for weeks because a deployed build and the repo reported the same version
while disagreeing about whether `/v1/voice/promo` needs an install id, and the
health endpoint had no way to say so.

Then confirm the one route that must work with **no identity headers at all**,
because that is exactly what the app sends for a promo preview:

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' \
  -X POST https://wordping-api.<subdomain>.workers.dev/v1/voice/promo \
  -H 'Content-Type: application/json' \
  -d '{"sample":"spontaneous","langCode":"en"}'
# 200 audio/wav
```

A `400 missing_install_id` here means the deployed Worker predates
`ANONYMOUS_FEATURES` and every Upgrade-sheet preview is failing, on every plan.
The app cannot work around it: it deliberately sends no install id for a promo,
so that playing one cannot mint a persistent identifier.

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
