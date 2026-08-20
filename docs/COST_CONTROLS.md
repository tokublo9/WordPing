# Cost controls

WordPing pays OpenAI per request. Speech is by far the expensive path. This
document is the checklist for keeping that bill bounded and predictable.

The defences are layered deliberately, cheapest first, so an abusive request is
refused before it costs anything:

```
request shape  →  kill switch  →  entitlement  →  input cap  →  rate limit  →  OpenAI
   (free)         (KV read)      (RevenueCat)     (free)        (KV)          ($$$)
```

---

## 1. OpenAI project budget — the hard ceiling

Everything else in this document is best-effort. **This is the only control
that cannot be bypassed by a bug in the Worker**, so set it first.

1. Create a dedicated project for WordPing (OpenAI dashboard → Projects → Create).
   A project-scoped key means a runaway here cannot spend another product's budget.
2. Issue the API key from *that project*, and set it as the Worker's `OPENAI_API_KEY`.
3. Project → Limits:
   - **Monthly budget**: set it to something you would be willing to lose. Requests are rejected past it.
   - **Email threshold**: set to ~50% of the budget so you hear about a problem while it is still small.
4. Organisation → Billing → set an alert at ~25% as an early tripwire.
5. Restrict the project to `gpt-4o-mini` and `gpt-4o-mini-tts` if your plan
   supports per-project model allowlists. The Worker already pins both, but this
   makes a compromised key less useful.

Review Usage weekly for the first month. `gpt-4o-mini-tts` is billed per input
character, so the Worker's per-day character budgets are the number that maps
most directly to spend.

---

## 2. Server-side limits

Defaults live in `cloudflare/wordping-api/src/config.ts`.

The monthly product policy is:

| Plan or playback | Monthly High-Quality AI Voice usage |
|---|---|
| Free | Upgrade samples only; arbitrary word-card generation is blocked |
| Basic | 200 new word-card generations per UTC month |
| Premium | No monthly quota; 20/minute and 300/day abuse limits still apply |
| Cached playback | Never counts |
| Voice picker | Preview generation never counts, including a cache miss |

The separate short-term abuse controls are:

| Feature | Tier | Chars/request | Req/min | Req/day | Chars/day |
|---|---|---|---|---|---|
| `voice_card` | Basic | 300 | 10 | 100 | 15,000 |
| `voice_card` | Premium | 500 | 20 | 300 | 50,000 |
| `voice_sample` | Basic/Premium | 120 | 8 | 40 | 4,000 |
| `voice_custom` | Premium | 1,000 | 5 | 30 | 15,000 |
| text actions | Premium | 500 | 20 | 300 | 50,000 |

Free tier is zero on arbitrary generation routes. Its two fixed Upgrade Plan
samples use the separately allowlisted, tightly rate-limited promo route.

IP buckets exist alongside install buckets at 6× the limit, as a backstop
against install-id rotation. The multiplier is loose on purpose — carrier NAT
puts many unrelated users behind one address, and a false positive there would
break a paying customer.

### Changing limits without a new build

Limits are read from KV on every request (cached ~60 s), so they can be
tightened during an incident:

```bash
cd cloudflare/wordping-api

# Halve the premium card-voice daily budget.
npx wrangler kv key put --binding=WORDPING_KV config:limits \
  '{"voice_card":{"premium":{"maxRequestsPerDay":150,"maxCharsPerDay":25000}}}'

# Revoke a tier entirely.
npx wrangler kv key put --binding=WORDPING_KV config:limits \
  '{"voice_custom":{"premium":{"maxRequestsPerMinute":0}}}'

# Back to the shipped defaults.
npx wrangler kv key delete --binding=WORDPING_KV config:limits
```

Only the fields you supply are overridden. A malformed value is logged and
ignored rather than taking the API down.

---

## 3. Emergency kill switches

Per feature, effective within about a minute, no redeploy:

```bash
# Stop the expensive one.
npx wrangler kv key put --binding=WORDPING_KV config:killswitch '{"voice_custom":true}'

# Stop everything.
npx wrangler kv key put --binding=WORDPING_KV config:killswitch \
  '{"voice_card":true,"voice_sample":true,"voice_custom":true,"meaning":true,"breakdown":true,"translation":true,"example":true}'

# Resume.
npx wrangler kv key delete --binding=WORDPING_KV config:killswitch
```

A disabled feature returns `503 feature_disabled` with `Retry-After: 300`. The
check runs *before* entitlement verification, so a killed feature costs nothing
at all — not even a RevenueCat lookup. Local vocabulary is entirely unaffected.

---

## 4. What keeps requests off the wire

- **Client file cache.** `src/lib/tts.ts` keys cached audio by `voice + text`
  (FNV-1a) under `Paths.cache/tts`. A word already heard is never regenerated,
  so the steady-state cost of a returning user is near zero.
- **Shared voice-preview cache.** The eight previews in the voice picker use
  fixed, server-chosen sentences, so they are generated once for all users and
  served from KV thereafter.
- **Request de-duplication.** `src/lib/ttsRequest.ts` collapses concurrent
  identical requests into one.
- **No automatic retries.** `src/lib/openai.ts` never retries. Once a request
  has left the isolate there is no way to know whether OpenAI processed and
  billed it, and a retry would risk paying twice for one tap.
- **Reserve-before-call.** Rate-limit budget is consumed before the OpenAI
  request, not after it succeeds. That over-counts a request that fails
  upstream, which is the correct direction: a failed request may still have
  been billed.

---

## 5. Monitoring

Weekly, or after any release that touches AI:

- OpenAI → Usage: cost per day, split by model. A step change without a
  matching install change is the signal to look at.
- Cloudflare → Workers → Analytics: request volume and error rate.
- Worker logs: `rate_limit_rejected` counts by feature. A sustained rise means
  either genuine growth or someone probing.
- RevenueCat → Charts: active subscribers. AI cost should track this number.
  Cost rising while subscribers are flat means abuse or a caching regression.

---

## 6. If costs spike

1. Kill the most expensive feature first (`voice_custom`, then `voice_card`).
2. Check Worker logs for a concentration of `rate_limit_rejected` on one hashed
   install or IP. That distinguishes abuse from growth.
3. Tighten `config:limits` rather than leaving the feature off, once you know
   the shape of the problem.
4. If a key leak is suspected, rotate `OPENAI_API_KEY` immediately
   (`npx wrangler secret put OPENAI_API_KEY`) and revoke the old one in the
   OpenAI dashboard. Rotating `RATE_LIMIT_SALT` at the same time resets every
   counter, which flushes any bucket an attacker had already spent.
5. Only then work out how it happened. See `docs/SECURITY.md`.
