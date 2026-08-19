# Security model and its limits

An honest account of what this architecture protects, what it does not, and
what would have to change to close the remaining gap.

---

## What it protects

**The OpenAI key.** It exists only as a Cloudflare Worker secret. It is not in
the Expo bundle, `app.json`, `eas.json`, source, SQLite, AsyncStorage,
SecureStore, or any committed `.env`. A test in `tests/audioTiming.test.cjs`
asserts that no client module references `api.openai.com`, an OpenAI key name,
or a key literal, and the release checklist greps the exported bundle.

**The RevenueCat secret key.** Same treatment. The app ships only the public
SDK key, which cannot read or grant entitlements.

**User vocabulary.** It never leaves the device. There is no account, no server
copy, and no analytics of card content. The only way words leave the phone is a
backup the user explicitly exports and shares.

**Entitlements.** Verified server-side against RevenueCat's API on every request
that is not answered from a ≤5 minute cache. A client-asserted `isPremium: true`
is not read anywhere in the Worker, and there is a test that proves it.

**Request content in logs.** `src/log.ts` accepts only scalars, so there is no
code path that can serialise a request body, an Authorization header, a
RevenueCat token, or user text into the log stream. Callers pass lengths and
hashes. A test asserts a full request round-trip leaks none of them.

**Rate-limit identity.** Install ids and IP addresses are salted-SHA-256 hashed
before becoming KV keys. Raw IPs are never stored or logged. Rotating
`RATE_LIMIT_SALT` invalidates every stored hash.

---

## What it does not protect — read this part

### The install id is not authentication

`X-WordPing-Install-Id` is a client-supplied header. Anyone can set it to
anything. It exists solely to spread rate-limit buckets across devices. It is
never treated as proof of anything, and this document is the reason the code
says so in three separate places.

### The App User ID is a bearer token in practice

This is the real gap. Entitlement is verified against RevenueCat using an
identifier the client supplies. Someone who extracts a paying subscriber's
RevenueCat App User ID — from a jailbroken device, a proxied build, or a
decompiled app — can present it and consume that subscriber's AI quota.

What limits the damage:

- The per-install and per-IP rate limits cap what a stolen id can spend.
- Per-day character budgets cap it further.
- The OpenAI project budget is the absolute ceiling.
- A kill switch can stop any feature within a minute.

What does **not** limit it: the install id, which the attacker also controls.

This is a deliberate, documented trade-off. Closing it properly requires
attesting that the request came from a genuine, unmodified build of the app —
see below.

### CORS is not a security boundary

`ALLOWED_ORIGINS` exists so the Expo dev server can talk to the Worker from a
browser. Native builds send no `Origin` at all, and a non-browser client ignores
CORS entirely. A request from a disallowed origin still succeeds; it simply gets
no `Access-Control-Allow-Origin` header back. There is a test asserting exactly
that, so nobody later mistakes it for a gate.

### Rate limits are approximate

KV is eventually consistent with no atomic increment, so counters are
read-modify-write. A burst of genuinely concurrent requests can overshoot a
limit by roughly one request per Cloudflare colo. Acceptable for cost control;
not a hard guarantee. Durable Objects are the upgrade path — `consume` in
`src/ratelimit.ts` is shaped to be swapped without touching the routes.

### Backups are unencrypted

An exported backup is plain JSON. Anyone who obtains the file can read the
user's vocabulary. It deliberately contains no API keys, no tokens, no
RevenueCat identifiers and no SecureStore values — an allowlist governs what is
written, and a second allowlist governs what is accepted on import, so a
hand-edited backup cannot inject an arbitrary settings key. But the words
themselves are readable. That is the expected trade for a file users can
inspect, diff and restore anywhere.

### The device is trusted

SQLite is not encrypted. On a compromised or jailbroken device the vocabulary is
readable. This matches the threat model — the data is the user's own study
material, not credentials.

---

## Future improvement: platform attestation

The one change that would meaningfully close the stolen-App-User-ID gap is
proving the request came from a real install of the real app.

**Apple App Attest** (iOS 14+) and **Google Play Integrity** both work the same
way: the OS issues a signed assertion the server can verify against the
platform's public keys. Neither can be forged by a repackaged app or a script.

### Where it would plug in

The Worker already has the seam. `src/pipeline.ts` runs an ordered sequence of
checks, and attestation belongs immediately after `readIdentity` and before the
entitlement lookup — so a forged client is rejected before it costs a RevenueCat
call:

```ts
// src/pipeline.ts, after: const identity = readIdentity(request);

const attestation = request.headers.get('X-WordPing-Attestation');
const verdict = await verifyAttestation(env, attestation, identity, response.requestId);
if (!verdict.ok) return reject('attestation_failed', 403, { reason: verdict.reason });
```

### What implementing it involves

1. **Client**: `expo-app-integrity` or a small native module. Generate a key
   once per install, store the key id in SecureStore next to the install id, and
   attach a fresh assertion to each AI request.
2. **Worker**: a new `src/attestation.ts` verifying the Apple App Attest
   receipt chain and the Play Integrity token. Both are stateless verifications
   against published public keys; the attested key id can be cached in the
   existing KV namespace.
3. **New secrets**: `APPLE_TEAM_ID` and `APPLE_BUNDLE_ID` (not secret, but
   configuration), plus a Google service-account credential for Play Integrity.
4. **Rollout**: ship it in warn-only mode first — verify, log, allow — until the
   pass rate across the installed base is high enough to enforce. Enforcing
   immediately would lock out anyone on an older build.
5. **Add `attestation_failed` to the error contract** in `src/http.ts` and to
   the client's `KIND_BY_SERVER_CODE` map, classified as `service_unavailable`
   so a user on an unsupported device sees a sensible message.

Until then, the layered rate limits, the entitlement check, the kill switches
and the OpenAI budget are what bound the exposure — and the exposure is bounded
spend, never user data.

---

## Reporting

Security issues in this repository: open a private issue or contact the
maintainer directly. Do not file a public issue containing a working exploit
against the deployed Worker.
