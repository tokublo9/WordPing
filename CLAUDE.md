# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

WordPing is a mobile vocabulary learning app (Expo / React Native). Users add words, review them with flip cards, and receive push notification reminders throughout the day.

**Core rule: keep the app simple, clean, and fast. Do not add complexity that does not serve this goal.**

---

## Commands

```bash
npm install --legacy-peer-deps   # always use --legacy-peer-deps
npx expo start                   # dev server — scan QR with Expo Go
npx expo start --clear           # dev server with cleared Metro cache
npx expo run:ios                 # build + run on iOS simulator
npx expo run:android             # build + run on Android emulator
npm run typecheck                # tsc --noEmit
npm run validate                 # typecheck + expo export (CI check)
npx supabase functions deploy openai   # deploy the Edge Function
eas build --platform ios --profile production   # production build
```

No test runner is configured.

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
| Storage | @react-native-async-storage/async-storage |
| Backend | Supabase (@supabase/supabase-js v2) — anonymous auth |
| AI (text) | OpenAI GPT-4o-mini via `openai` Edge Function |
| AI (TTS) | OpenAI gpt-4o-mini-tts via `openai` Edge Function |
| Safe area | react-native-safe-area-context |

**iOS bundle ID:** `com.daiki0219.wordping`

**Build system:** CNG — `ios/` and `android/` are gitignored. Never commit them. EAS regenerates them.

**expo-crypto** and **@react-native-community/netinfo** are **not** installed.

---

## Architecture

### State and bootstrapping

`App.tsx` is the root. It composes three hooks:

- **`src/app/useAppSettings.ts`** — React state for theme, skin, language, AI voice, display flags. Exposes `applySettings(s)` called by the bootstrap hook.
- **`src/app/useAppBootstrap.ts`** — one-time `useEffect` that loads AsyncStorage and Supabase data in phases: (1) cards + settings, (2) UI prefs in parallel, (3) onboarding, (4) navigation decision. Calls `markSettingsLoaded()` as early as possible so the subscription enforcement effect can fire.
- **`src/app/useAppPersistence.ts`** — `useEffect` watchers that write back to AsyncStorage whenever state changes. Guards every write with `if (!hasLoaded.current)` to skip no-op writes on mount.

`App.tsx` also contains `AppContextMenu`, `AppModals`, and `AppOverlays` split components for the three-dots menu, all modal overlays, and absolute-positioned overlays respectively.

### Data layer (`src/lib/db.ts`)

- `bootstrapData()` — loads cards + settings from AsyncStorage, falls back to defaults on first launch, writes default seed data. Must complete before `readFolders()` on first launch.
- `persist({ cards, settings })` — serialises to AsyncStorage.
- Supabase sync runs in the background after local data has already been applied to state.
- `migrateCards()` in `useAppBootstrap.ts` assigns `folderId` to pre-folder cards on upgrade.

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

### AI gateway (`src/lib/openaiGateway.ts`)

- `requestAIText()` — text actions (meaning, breakdown, translation, example) via `supabase.functions.invoke()`.
- `requestAISpeech()` — uses raw `fetch()` to `${SUPABASE_URL}/functions/v1/openai` to receive a binary audio response (`ArrayBuffer`). Normalises and validates `voice` before sending; falls back to `DEFAULT_AI_VOICE` for any unrecognised value.

### Supabase Edge Function (`supabase/functions/openai/index.ts`)

Single Deno function handles both paths:
- **`action: 'speech'`** — calls OpenAI `gpt-4o-mini-tts`, returns raw binary audio (`audio/wav` or `audio/mpeg`). Valid voices: `alloy ash ballad cedar coral echo fable marin nova onyx sage shimmer verse`.
- **`action: 'meaning' | 'breakdown' | 'translation' | 'example'`** — calls GPT-4o-mini, returns `{ text }` JSON.

Auth: anonymous Supabase JWT in `Authorization` header, validated before any OpenAI call.

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

`useSubscription.ts` (AsyncStorage stub — real IAP requires RevenueCat + native build):

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
  db.ts                     # AsyncStorage load/persist + Supabase sync
  tts.ts                    # AI TTS with persistent file cache + device TTS fallback
  openaiGateway.ts          # Supabase/OpenAI API calls (text + speech)
  supabase.ts               # Supabase client + anonymous auth
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
  KisekaeShopSheet.tsx      # Theme Shop
  WordModal.tsx             # Add/edit card — uses expo-audio and expo-file-system
supabase/functions/openai/  # Deno Edge Function: text + TTS via OpenAI
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
6. AsyncStorage timing? (`hasLoaded.current` guard)
7. File system? (`file.exists` is a property, not a method; `Paths.cache` vs `Paths.document`)
8. Voice mismatch? (client `AI_VOICES` vs Edge Function `VOICES` set)
9. Website only: CSS / Tailwind, Vercel root directory

---

## Final Check Before Finishing

- [ ] `npm run typecheck` passes
- [ ] App still runs (`npx expo start`)
- [ ] Free / Basic plan rules still work
- [ ] Theme color resets on downgrade
- [ ] Skins preview correctly in shop
- [ ] Notification menu item still visible (not gated on permission)
- [ ] Word card layout unchanged (unless task asked)
- [ ] If Edge Function changed: `npx supabase functions deploy openai`
- [ ] If website changed: builds without errors, no blank Vercel page
- [ ] No unrelated files changed
