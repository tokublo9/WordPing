# Deployment

Everything needed to ship the account-free, local-first WordPing: the Cloudflare
Worker that proxies AI, the app itself, verification, and rollback.

The architecture in one line: **vocabulary in on-device SQLite, AI through the
Cloudflare Worker, subscriptions through RevenueCat verified server-side, and
backup export/import for moving to a new phone.** There is no account, no login
and no cloud sync, so the core app works entirely offline.

Nothing in this document is executed automatically. The production deploy is a
deliberate manual step.

---

## 1. Required secrets

Set as **Cloudflare Worker secrets only**. None of these may appear in
`EXPO_PUBLIC_*`, `app.json`, `eas.json`, source, SQLite, AsyncStorage,
SecureStore, or a committed `.env`.

| Secret | Where to get it | Required |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI dashboard → API keys (use a dedicated project key) | Yes |
| `REVENUECAT_SECRET_API_KEY` | RevenueCat → Project → API keys → **secret** (`sk_`) key | Yes |
| `RATE_LIMIT_SALT` | Any long random string you generate | Strongly recommended |

The RevenueCat key must be the **secret** one. The `appl_`/`goog_` public SDK
key the app uses cannot read entitlements server-side.

Non-secret tunables live in `wrangler.toml` under `[vars]`.

---

## 2. Deploy the Worker

```bash
cd cloudflare/wordping-api
npm install

# One-time: create KV and paste both ids into wrangler.toml.
npx wrangler kv namespace create WORDPING_KV
npx wrangler kv namespace create WORDPING_KV --preview

# One-time: secrets.
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put REVENUECAT_SECRET_API_KEY
npx wrangler secret put RATE_LIMIT_SALT

npm test          # must pass before deploying
npx wrangler deploy
```

Local development instead of deploying:

```bash
npx wrangler dev  # http://127.0.0.1:8787
```

---

## 3. Configure the app

`.env` in the repo root (gitignored; `.env.example` is the template):

```
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...
EXPO_PUBLIC_WORDPING_API_BASE_URL=https://wordping-api.<subdomain>.workers.dev
```

Both are public by design. The base URL is the address of a proxy, not a
credential.

For EAS builds, add `EXPO_PUBLIC_WORDPING_API_BASE_URL` to the relevant profile
in `eas.json` or to the EAS project's environment variables. A build without it
starts normally and shows all local vocabulary; only AI features are
unavailable, and `src/lib/api/client.ts` logs the misconfiguration in dev.

```bash
npm install --legacy-peer-deps
npm run typecheck
npm test
npx expo start
```

---

## 4. Production verification checklist

Run against the deployed Worker with a real build.

**Worker**

- [ ] `curl https://<worker>/v1/health` returns all three `*Configured: true`
- [ ] A request with no identity headers returns `400 missing_install_id`
- [ ] A `GET` to `/v1/voice/card` returns `405`
- [ ] A free RevenueCat user gets `403 subscription_required` on `/v1/meaning`
- [ ] A Basic user gets audio from `/v1/voice/card` and `403` from `/v1/voice/custom`
- [ ] A Premium user gets audio from `/v1/voice/custom` and text from `/v1/meaning`
- [ ] Over-length input returns `400 input_too_long`
- [ ] Rapid repeats produce `429` with a `Retry-After` header
- [ ] `config:killswitch` disables one feature within a minute and leaves the rest working
- [ ] No log line contains user text, an Authorization header, or a key

**App — offline**

- [ ] Airplane mode: the app launches, and words, folders and review state are all present
- [ ] Adding, editing, reordering and deleting words works offline
- [ ] Test mode works offline
- [ ] Notifications still schedule offline
- [ ] An AI request while offline shows an AI-specific message and nothing else breaks

**App — online**

- [ ] Word-card AI voice plays for a subscriber
- [ ] The same word played twice hits the local file cache and issues no second request
- [ ] Voice previews in Settings play, and the second device to request one gets `X-WordPing-Cache: hit`
- [ ] AI meaning/breakdown/translation/example work for Premium
- [ ] Free plan still gets device TTS
- [ ] Theme colour resets to blue on downgrade
- [ ] Skins preview correctly in the shop
- [ ] The Notification menu item is visible regardless of permission state
- [ ] The word-card layout is unchanged

**Data**

- [ ] Upgrading from a build with existing AsyncStorage data preserves every word, folder, note, level and review date, in the same order
- [ ] Force-quitting during first launch and relaunching does not duplicate anything
- [ ] Backup export produces a file; importing it on a second device reproduces everything
- [ ] Merge import keeps existing words; replace import warns first
- [ ] Reopening the app does not create a new RevenueCat identity — `getAppUserID()` is stable across launches
- [ ] A subscriber who upgrades keeps their entitlement without pressing Restore

**Bundle**

- [ ] `npx expo export --platform ios --output-dir /tmp/wp` then `grep -ri "sk-proj\|sk_\|api.openai.com" /tmp/wp` returns nothing

---

## 5. Rollback

The Worker and the app roll back independently.

**Worker only** (AI broken, app fine):

```bash
cd cloudflare/wordping-api
npx wrangler deployments list
npx wrangler rollback --message "reverting <reason>"
```

Or disable the affected feature without deploying anything:

```bash
npx wrangler kv key put --binding=WORDPING_KV config:killswitch '{"voice_card":true}'
```

Users keep every local feature; only that AI feature reports
`feature_disabled`.

**App**: re-release the previous build through EAS / App Store Connect.

> **The SQLite migration is one-way.** An older build reads AsyncStorage, which
> this version never deletes, so a downgraded user still sees every word they
> had *at the moment they upgraded* — but anything added since the upgrade lives
> only in SQLite and will not appear. Before a downgrade, have the user export a
> backup.

---

## 6. Manual dashboard actions

Things no script in this repo can do for you.

**Cloudflare**

1. Create the KV namespace and paste both ids into `wrangler.toml`.
2. Set the three secrets.
3. Optional: attach a custom domain to the Worker and update `EXPO_PUBLIC_WORDPING_API_BASE_URL`.
4. Optional: add a WAF rate-limiting rule in front of the Worker as an extra layer.
5. Check Workers Analytics after release for error-rate spikes.

**OpenAI**

1. Create a dedicated **project** for WordPing and issue the key from it, so the budget below is scoped to this app alone.
2. Set a monthly budget and usage alerts — see `docs/COST_CONTROLS.md`.
3. Confirm `gpt-4o-mini` and `gpt-4o-mini-tts` are enabled for the project.

**RevenueCat**

1. Copy the **secret** (`sk_`) key — not the public SDK key.
2. Confirm the entitlement identifiers are exactly `basic` and `premium`, matching `[vars]` in `wrangler.toml`.
3. Leave anonymous customers enabled. Do not enable any setting that resets App User IDs.

**Apple**

1. No change. Products and subscriptions are unaffected by this migration.

---

## 7. What each piece stores

| Store | Contents | Leaves the device? |
|---|---|---|
| SQLite (`wordping.db`) | Words, folders, notes, labels, review state, settings, audio-cache index | No |
| Filesystem | Cached TTS audio (`Paths.cache/tts`), backups (`Paths.document/backups`) | Only when the user shares a backup |
| SecureStore | The random installation id | Sent as a rate-limit header |
| RevenueCat SDK | The App User ID and receipt state | To RevenueCat, as it always did |
| Cloudflare KV | Rate-limit counters, hashed identity keys, cached entitlement tiers, eight voice previews | N/A |
