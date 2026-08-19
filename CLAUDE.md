# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

WordPing is a mobile vocabulary learning app (Expo / React Native). Users add words, review them with flip cards, and receive push notification reminders throughout the day.

**Core rule: keep the app simple, clean, and fast. Do not add complexity that does not serve this goal.**

**Account-free and local-first.** There is no login and no user account. All vocabulary data lives on the device in SQLite and never leaves it, except through a backup the user explicitly exports. The only network calls in the app are AI features, and every one of them must fail without affecting anything else.

---

## Commands

```bash
npm install --legacy-peer-deps   # always use --legacy-peer-deps
npx expo start                   # dev server — scan QR with Expo Go
npx expo start --clear           # dev server with cleared Metro cache
npx expo run:ios                 # build + run on iOS simulator
npx expo run:android             # build + run on Android emulator
npm run typecheck                # app + test project + Worker
npm test                         # all three suites
npm run validate                 # typecheck + tests + expo export
eas build --platform ios --profile production   # production build

cd cloudflare/wordping-api && npx wrangler dev      # AI proxy, locally
cd cloudflare/wordping-api && npx wrangler deploy   # deploy the AI proxy
```

### Tests

Three suites, all run by `npm test`:

| Suite | Command | What it covers |
|---|---|---|
| Source assertions | `npm run test:source` | `tests/*.cjs` — structural invariants read from source text |
| Unit | `npm run test:unit` | `tests/unit/*.ts` — SQLite schema, migration, repositories, backup, error mapping. Compiled by `tsconfig.test.json`, run against real SQLite via `sql.js` |
| Worker | `npm run test:worker` | `cloudflare/wordping-api/test/*.test.ts` — vitest |

A module under `tests/unit` must import **no** react-native or expo code, or it will not compile in the test project. Keep pure logic in modules that satisfy that, and put the expo bindings in a thin adapter beside it (`src/lib/sqlite/database.ts`, `src/lib/backup/backupFile.ts`).

---

## App Name

**WordPing**. Do not use old names: WordMemo, Vocabulary, Memora, Wordloop.

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | Expo 54 / React Native 0.81.5 |
| Language | TypeScript 5.9 strict |
| React | 19 |
| Icons | @expo/vector-icons (Ionicons) |
| Audio playback | expo-audio ~1.1.1 |
| Device TTS | expo-speech ~14.0.8 |
| File system | expo-file-system ~19.0.23 (next-gen API: `File`, `Directory`, `Paths`) |
| Notifications | expo-notifications |
| Blur | expo-blur |
| Vocabulary storage | expo-sqlite ~16.0.10 |
| UI prefs / legacy storage | @react-native-async-storage/async-storage |
| Device identifier | expo-secure-store ~15.0.8 |
| Backend | Cloudflare Worker (`cloudflare/wordping-api`) — AI proxy only, stores no user data |
| AI (text) | OpenAI GPT-4o-mini via the Worker |
| AI (TTS) | OpenAI gpt-4o-mini-tts via the Worker |
| Subscriptions | RevenueCat, anonymous customers, verified server-side |
| Safe area | react-native-safe-area-context |

**iOS bundle ID:** `com.daiki0219.wordping`

**Build system:** CNG — `ios/` and `android/` are gitignored. Never commit them. EAS regenerates them.

**There is no hosted database and no auth provider.** WordPing has no accounts, no login, no session and no server-side copy of user data. The only backend is the Cloudflare Worker, and it is a stateless AI proxy that stores nothing belonging to a user. Do not add a backend-as-a-service client to this app.

**expo-crypto** and **@react-native-community/netinfo** are **not** installed.

---

## Architecture

### State and bootstrapping

`App.tsx` is the root. It composes three hooks:

- **`src/app/useAppSettings.ts`** — React state for theme, skin, language, AI voice, display flags. Exposes `applySettings(s)` called by the bootstrap hook.
- **`src/app/useAppBootstrap.ts`** — one-time `useEffect` that loads local data in phases: (1) cards + settings from SQLite, (2) UI prefs from AsyncStorage in parallel, (3) onboarding, (4) navigation decision. Every phase is on-device, so startup never waits on the network. Calls `markSettingsLoaded()` as early as possible so the subscription enforcement effect can fire.
- **`src/app/useAppPersistence.ts`** — `useEffect` watchers that write back to AsyncStorage whenever state changes. Guards every write with `if (!hasLoaded.current)` to skip no-op writes on mount.

`App.tsx` also contains `AppContextMenu`, `AppModals`, and `AppOverlays` split components for the three-dots menu, all modal overlays, and absolute-positioned overlays respectively.

### Data layer (`src/lib/db.ts` → `src/lib/sqlite/*`)

`db.ts` keeps the same public API it had in the AsyncStorage era — `bootstrapData()`, `persist()`, `readFolders()`, `persistFolders()` — so App.tsx and the feature hooks were not rewritten. Only the engine underneath changed.

- `bootstrapData()` — opens the database, runs pending schema migrations, runs the one-time AsyncStorage import, seeds welcome content on a genuine first launch. **No network.**
- `persist({ cards, settings })` and `persistFolders(folders)` — both feed one queued write. `db.ts` coalesces them into a **single transaction, folders first**, so a word created alongside a brand-new folder satisfies its foreign key. Do not make either write directly.
- `reloadLocalData()` — re-reads everything. Used after a backup import replaces rows underneath React state.
- `migrateCards()` in `useAppBootstrap.ts` assigns `folderId` to pre-folder cards on upgrade.

**Layering.** UI and hooks call `db.ts`. `db.ts` calls `src/lib/sqlite/repositories.ts`. Only `repositories.ts` (and the backup modules) write SQL. Never put a query in a component.

| Module | Role |
|---|---|
| `sqlite/types.ts` | The `SqlDatabase` interface everything is written against |
| `sqlite/schema.ts` | DDL, the append-only migration list, level-label seeding |
| `sqlite/repositories.ts` | The only place vocabulary SQL is written |
| `sqlite/legacyMigration.ts` | One-time, idempotent AsyncStorage import |
| `sqlite/database.ts` | The only file that imports expo-sqlite |

**Schema rules**
- `MIGRATIONS` in `schema.ts` is **append-only**. Never edit or renumber an existing entry — shipped devices have already recorded it as applied and will skip it. Add a new entry and bump `CURRENT_SCHEMA_VERSION`.
- Foreign keys are enforced (`PRAGMA foreign_keys = ON`, set per connection).
- Deleting a folder sets its words' `folder_id` to NULL. Deleting a word cascades to its note, labels, progress, review history and audio-cache rows.
- A word's review level lives in `learning_progress.level_id`, referencing a seeded row in `labels`. That is the single source of truth — do not add a duplicate column.
- `word_labels` exists and round-trips through backup, but has no producer yet. It is there for future user-defined labels.

**Legacy migration** — never runs twice (marker row written in the same transaction as the data), and **never deletes the AsyncStorage source**. Duplicate ids collapse to the first occurrence; a card pointing at a missing folder keeps the word and loses the link.

### Backup (`src/lib/backup/*`)

The replacement for cloud sync, and the only way vocabulary leaves the device.

- `format.ts` — versioned JSON shape, plus `EXPORTABLE_SETTING_KEYS`, an **allowlist**. A setting added later is excluded until someone deliberately adds it.
- `validate.ts` — validates the whole file, including cross-table relationships, before the database is touched.
- `importBackup.ts` — one transaction, `replace` or `merge`. Any failure rolls the entire import back. The settings allowlist is enforced again on the way in, so a hand-edited backup cannot inject a key.
- `backupFile.ts` — the expo-file-system / sharing / document-picker bindings.
- `BackupSection.tsx` in Settings. Replacement always requires a second confirmation.

Never export `audioUri` (a device-local path), the install id, RevenueCat identifiers, or any SecureStore value.

### TTS pipeline

Two separate TTS systems run in parallel:

**Word-card TTS (`src/lib/tts.ts`)**
- Free users → `expo-speech` (device TTS, auto-detects locale via Unicode script ranges).
- Subscribed users → `speakWithAI()`: calls `fetchAndCacheAudio()`, which checks a persistent file cache (`Paths.cache/tts/*.wav`) before hitting the network.
- Cache is keyed by `${voice}\x00${text}`, hashed with FNV-1a 32-bit. Filenames: `${voice}_${hash}.wav`.
- `audioFocus.ts` — module-level singleton that stops the previous player when a new one starts.
- `setAIVoicePreference(voice)` sets `activeAIVoice` (module-level) and stops current playback.

**Prototype/standalone TTS (`src/lib/prototypeTextToSpeech.ts`)**
- Used by `TextToSpeechScreen`. Generates MP3 audio and saves it to `Paths.document/text-to-speech/`.
- History is tracked in AsyncStorage (`@wordping/text_to_speech_history`), max 10 entries.
- Does **not** share its cache with word-card TTS.

**Silence trimming** now runs on the client (`src/lib/wavSilence.ts`), not the server. The Worker streams audio straight through; `openaiGateway.ts` analyses the buffer it already has and registers the timing that `tts.ts` uses to skip leading silence and end playback early.

### TTS pipeline

Two separate TTS systems run in parallel:

**Word-card TTS (`src/lib/tts.ts`)**
- Free users → `expo-speech` (device TTS, auto-detects locale via Unicode script ranges).
- Subscribed users → `speakWithAI()`: calls `fetchAndCacheAudio()`, which checks a persistent file cache (`Paths.cache/tts/*.wav`) before hitting the network.
- Cache is keyed by `${voice}\x00${text}`, hashed with FNV-1a 32-bit. Filenames: `${voice}_${hash}.wav`.
- `audioFocus.ts` — module-level singleton that stops the previous player when a new one starts.
- `setAIVoicePreference(voice)` sets `activeAIVoice` (module-level) and stops current playback.

**Prototype/standalone TTS (`src/lib/prototypeTextToSpeech.ts`)**
- Used by `TextToSpeechScreen`. Generates MP3 audio and saves it to `Paths.document/text-to-speech/`.
- History is tracked in AsyncStorage (`@wordping/text_to_speech_history`), max 10 entries.
- Does **not** share its cache with word-card TTS.

### AI gateway (`src/lib/openaiGateway.ts` → `src/lib/api/*`)

- `requestAIText()` / `requestAISpeech()` keep their old signatures. `requestAISpeech` still normalises and validates `voice`, falling back to `DEFAULT_AI_VOICE`.
- `api/client.ts` is the **only** place in the app that calls `fetch`. Every AI request carries an `AbortController` timeout, the two identity headers, and no credential of any kind.
- `api/errors.ts` classifies failures as `offline | timeout | cancelled | subscription_required | rate_limited | usage_limited | invalid_input | service_unavailable | generation_failed`. `AIRequestError.kind` carries that; `Error.message` keeps the legacy codes (`plan_required`, `quota_exceeded`, `input_too_long`, …) that the existing screens already match on. **Branch on `kind` in new code; do not change the legacy messages without updating every screen.**
- Identity resolves **lazily, on the first AI request** — never during bootstrap. Local vocabulary must not wait on RevenueCat.

`EXPO_PUBLIC_WORDPING_API_BASE_URL` is public. It is the address of a proxy, not a secret.

### Cloudflare Worker (`cloudflare/wordping-api/`)

A stateless AI proxy. It stores no user data. See its README for routes and operations, `docs/COST_CONTROLS.md` for budgets, `docs/SECURITY.md` for the threat model.

| Route | Requires |
|---|---|
| `POST /v1/voice/card` | Basic |
| `POST /v1/voice/sample` | Basic |
| `POST /v1/voice/promo` | Nothing — the only free route. Two fixed promo clips, no client text |
| `POST /v1/voice/custom` | Premium |
| `POST /v1/meaning`, `/v1/breakdown`, `/v1/translate`, `/v1/examples` | Premium |

Non-negotiables when touching the Worker:

- **Secrets are `OPENAI_API_KEY`, `REVENUECAT_SECRET_API_KEY`, `RATE_LIMIT_SALT` — Worker secrets only.** Never in `EXPO_PUBLIC_*`, `app.json`, `eas.json`, source, SQLite, AsyncStorage, SecureStore, or a committed `.env`.
- Entitlement is always verified against RevenueCat. **Never trust a client flag** like `isPremium: true`.
- Model, upstream URL and voice come from `src/config.ts` only. Request bodies are parsed with non-strict zod schemas so unknown fields are *stripped*, never forwarded.
- **Never retry an OpenAI request.** A timeout is indistinguishable from a slow success, and a retry risks billing twice.
- `src/log.ts` accepts scalars only. Never log user text, secrets, headers, or raw IPs.
- Errors are `{ error, requestId }`. Never a stack trace, never an upstream message.
- The guard order in `src/pipeline.ts` is deliberate: shape → kill switch → validation → entitlement → input cap → rate limit → OpenAI. Cheapest and most protective first. Do not reorder it.

### AI voices (`src/lib/aiVoices.ts`)

Client-side valid voices: `cedar fable alloy ash coral nova marin shimmer`. Default: `marin`.

**The Edge Function VOICES set must be a superset of the client's `AI_VOICES` array.** If you add a voice to `AI_VOICES`, also add it to the Edge Function and redeploy.

Voice is persisted under `AI_VOICE_KEY = 'ai_voice'` in AsyncStorage. Loaded by `db.ts` with `isAIVoice()` guard; falls back to `DEFAULT_AI_VOICE` if stale.

### File system API (expo-file-system 19.x next-gen)

Use the next-generation API exclusively — **not** the legacy `FileSystem.downloadAsync` / `FileSystem.readAsStringAsync` API.

```typescript
import { Directory, File, Paths } from 'expo-file-system';

const dir = new Directory(Paths.cache, 'my-dir');
dir.create({ intermediates: true, idempotent: true });
const file = new File(dir, 'filename.wav');
file.create({ overwrite: true });
file.write(new Uint8Array(arrayBuffer));
file.exists   // boolean property, not a method
file.uri      // string — pass to expo-audio or expo-sharing
file.delete()
new File(srcUri).copy(destFile);
```

`Paths.cache` — OS-managed, cleared on low storage. Use for TTS cache and temp files.
`Paths.document` — persistent user data. Use for saved/exported audio history.

---

## Key Rules

### Before changing any code

Read the relevant file first. Do not rewrite working code to fix a bug in one place.

### Three-dots menu (always required items)

1. Select entries
2. Reorder cards
3. Show / hide level labels (cards context only)
4. **Notification** — always visible, never gated on `notificationGranted`
5. **Settings**

### Theme color enforcement

Free plan → `FREE_THEME_COLOR = '#3B82F6'` only. Enforced in `App.tsx`:

```typescript
useEffect(() => {
  if (!settingsLoaded || !isSubscriptionLoaded) return;
  if (!isSubscribed && themeColor !== FREE_THEME_COLOR) {
    setThemeColor(FREE_THEME_COLOR);
  }
}, [isSubscribed, isSubscriptionLoaded, settingsLoaded, themeColor]);
```

This must run **after both** `settingsLoaded` and `isSubscriptionLoaded` are true.

### Subscription / plan limits

`useSubscription.ts` — RevenueCat, iOS only. Android and web short-circuit to `free`.

**Identity: never call `Purchases.logIn` or `logOut` in production code.** There are no accounts, so there is nothing to log in as. The SDK persists whichever App User ID it is already using and restores it every launch, which means a fresh install gets a RevenueCat anonymous id and an upgrading user keeps the id their purchases are attached to. Calling `logOut` would mint a new anonymous user and strand existing subscribers until they found "Restore Purchases". The dev-only `unsubscribe()` helper does call `logOut`, and must call `resetApiIdentity()` alongside it.

The app's plan state is for **UI only**. Access to a billable AI feature is decided by the Worker, which verifies the entitlement against RevenueCat server-side.

| Limit | Free | Basic |
|---|---|---|
| Words | Unlimited | Unlimited |
| Folders | Unlimited | Unlimited |
| TTS plays | 10 (`FREE_VOICE_LIMIT`) | Unlimited |
| Theme colors | Blue only | All |
| Skins | `solid_blue` only | All |

**Words and folders are never gated.** No count check may block registration, and no
Pro/paywall popup may be raised from adding a word or creating a folder on any plan.
`PaywallModal` covers the AI voice limit only.

### Skins

Defined in `constants.ts` as stable config objects. `KisekaeShopSheet.tsx` renders the shop. Preview cards must reflect the real skin appearance (blur, tint, overlay, sparkles). Never recreate config objects inline.

### Notifications

`rescheduleAllNotifications(cards, folders)` distributes up to 64 slots across folders with a non-zero interval. Per-card mute: `WordCard.notifOff = true`. `notificationGranted` only controls whether scheduling happens — never gates the menu item.

### Word card layout (`SwipeableCard.tsx`)

- Front: word + optional level label + `notifOff` indicator (top-right, non-interactive)
- Back: meaning + note
- Swipe-reveal right: notification toggle, move, edit, delete
- Long-press: action overlay with same actions

Do not change this layout unless the task specifically asks for it.

---

## Data Model

```typescript
interface WordCard {
  id: string;
  word: string;
  meaning: string;
  note: string;
  notifOff?: boolean;
  folderId?: string;
  wordLang?: string;        // BCP-47 for TTS
  meaningLang?: string;
  testLevel?: 'perfect' | 'good' | 'slightly' | 'unknown';
  testNextReview?: number;  // Unix ms for spaced-repetition skip
  audioUri?: string;        // custom audio file URI
  audioSpeed?: number;
  audioVolume?: number;
}

interface Folder {
  id: string;
  name: string;
  createdAt: number;
  icon?: string;
  color?: string;
  notifSettings?: { intervalSeconds: number; displayOnlyWord: boolean };
}
```

---

## Project Structure (non-obvious parts)

```
App.tsx                     # Root — all global state, composed from src/app/* hooks
src/app/
  useAppBootstrap.ts        # One-time async load: cards, settings, onboarding, nav
  useAppSettings.ts         # React state for theme/skin/language/aiVoice/display flags
  useAppPersistence.ts      # useEffect writers — guards every write with hasLoaded
  AppContextMenu.tsx        # Three-dots menu content
  AppModals.tsx             # All modal overlays
  AppOverlays.tsx           # Absolute-positioned overlays (banners, toasts)
src/lib/
  db.ts                     # Public local-data API over the SQLite repositories
  parsing.ts                # Defensive parsers for stored / user-supplied data (pure)
  installId.ts              # Random install id in SecureStore — NOT authentication
  wavSilence.ts             # Client-side WAV silence analysis (pure)
  sqlite/
    types.ts                # The SqlDatabase interface everything is written against
    schema.ts               # DDL + append-only migrations + level-label seed
    repositories.ts         # The only module that writes vocabulary SQL
    legacyMigration.ts      # One-time idempotent AsyncStorage import
    database.ts             # The only file importing expo-sqlite
  backup/
    format.ts               # Versioned shape + exportable-settings allowlist
    validate.ts             # Whole-file validation before any write
    exportBackup.ts         # Database -> backup document
    importBackup.ts         # Transactional replace / merge with full rollback
    backupFile.ts           # expo-file-system / sharing / document-picker bindings
  api/
    client.ts               # The ONLY fetch in the app; timeouts, identity headers
    errors.ts               # Failure classification + legacy message codes (pure)
  tts.ts                    # AI TTS with persistent file cache + device TTS fallback
  openaiGateway.ts          # AI request shaping over api/client
  aiVoices.ts               # AI_VOICES list, DEFAULT_AI_VOICE, isAIVoice()
  audioFocus.ts             # Module singleton: stops previous player on new playback
  prototypeTextToSpeech.ts  # Standalone TTS screen: generate, save history, export
  generateMeaning.ts        # AI meaning/note generation (calls openaiGateway)
  pricing.ts                # Plan/feature definitions
src/utils/
  createId.ts               # crypto.randomUUID() with fallback
  reportSideEffectFailure.ts
src/components/
  FlipCardBrowser.tsx       # 3-slot horizontal swipe carousel (slot 0=curr, 1=next, 2=prev)
  SwipeableCard.tsx         # PanResponder card (flip, swipe-reveal, long-press)
  TestModeScreen.tsx        # Multiple-choice quiz with spaced repetition
  TextToSpeechScreen.tsx    # Standalone TTS generator + history
  SettingsModal.tsx         # Settings + AI voice picker
  BackupSection.tsx         # Backup export / import, in Settings
  KisekaeShopSheet.tsx      # Theme Shop
  WordModal.tsx             # Add/edit card — uses expo-audio and expo-file-system
cloudflare/wordping-api/    # Cloudflare Worker: the AI proxy (see its README)
tests/unit/                 # TypeScript unit tests, real SQLite via sql.js
docs/                       # DEPLOYMENT, COST_CONTROLS, SECURITY
website/                    # Next.js 15 marketing site (independent from app)
```

---

## Website (`website/`)

Next.js 15 App Router, next-intl v3.26, Tailwind CSS v3, React 19. Deployed to Vercel (Root Directory = `website`).

**Critical layout rule:** `globals.css` must be imported in `app/[locale]/layout.tsx` only — never in the root `app/layout.tsx`. If Tailwind stops working, check this first.

Locales: `en ja ko zh es fr de pt vi id th ar` — JSON files in `website/messages/`. `generateStaticParams()` pre-renders all 12 at build time. Static assets go in `website/public/` and are referenced as `/filename.png`.

---

## When Fixing Bugs

1. What recently changed?
2. Condition issue? (flag that is now false)
3. Rendering issue? (stale ref, missing dep)
4. z-index / absolute positioning?
5. Subscription state? (`isLoaded`, `isSubscribed`, `settingsLoaded`)
6. Storage timing? (`hasLoaded.current` / `cardsLoaded.current` guards)
7. File system? (`file.exists` is a property, not a method; `Paths.cache` vs `Paths.document`)
8. Voice mismatch? (client `AI_VOICES` vs the Worker's `VOICES` allowlist — the Worker must be a superset)
9. AI failing? Check the Worker's `requestId` from the error, then its logs. Distinguish `subscription_required` (entitlement), `rate_limit_exceeded` (our budget), `quota_exceeded` (OpenAI's throttle), `feature_disabled` (kill switch) and `entitlement_service_unavailable` (RevenueCat down — fails closed by design)
10. Data missing after upgrade? The AsyncStorage source is never deleted. Check `app_settings` for the `migration:asyncstorage:v1` marker before assuming the import ran
11. Foreign-key error on save? Something wrote words without their folders. Both must go through the single queued transaction in `db.ts`
12. Website only: CSS / Tailwind, Vercel root directory

---

## Final Check Before Finishing

- [ ] `npm run typecheck` passes (app + test project + Worker)
- [ ] `npm test` passes (all three suites)
- [ ] App still runs (`npx expo start`)
- [ ] **App starts and all vocabulary works with the network off**
- [ ] An AI failure affects only that feature — never startup, never local data
- [ ] Free / Basic plan rules still work
- [ ] Theme color resets on downgrade
- [ ] Skins preview correctly in shop
- [ ] Notification menu item still visible (not gated on permission)
- [ ] Word card layout unchanged (unless task asked)
- [ ] If the schema changed: a new append-only migration, existing data survives, `npm run test:unit` covers it
- [ ] If the backup format changed: version bumped, old versions still import, round-trip test added
- [ ] If the Worker changed: `npm run test:worker`, then `cd cloudflare/wordping-api && npx wrangler deploy`
- [ ] **No secret in any `EXPO_PUBLIC_*`, `app.json`, `eas.json`, or committed file**
- [ ] If website changed: builds without errors, no blank Vercel page
- [ ] No unrelated files changed
