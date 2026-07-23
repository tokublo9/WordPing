# WordPing

A vocabulary learning app for iOS built with Expo and React Native.

Users add words they want to remember. WordPing helps them review those words through flip cards and scheduled push notifications throughout the day.

---

## Features

### Core
- **Flashcards** — tap a card to flip it and reveal the meaning
- **Notes** — attach an optional note to each word, shown on the card back
- **Folders** — organize words into separate folders; each folder has its own notification schedule
- **Word limit** — 30 words on the free plan (unlimited on Basic)

### Review Modes
- **List view** — scroll through all cards with swipe-reveal actions (edit / delete / move / mute)
- **Flip mode** — tap through cards one by one in a full-screen browser
- **Test mode** — multiple-choice quiz; tracks mastery level (Perfect / Good / Slightly / Unknown) and schedules spaced repetition

### Notifications
- **Per-folder schedule** — set a reminder interval (30 min / 1 h / 2 h / 3 h / 6 h / 12 h / 24 h / Off) independently for each folder
- **Per-word mute** — exclude individual cards from notifications via swipe-reveal or long-press menu
- **Display Only Word** — optional mode that hides the meaning in the notification, showing only the word
- Up to 64 notifications pre-scheduled on iOS

### AI & Voice
- **AI meaning generation** — auto-generate a meaning or example note using GPT-4o-mini through an authenticated Supabase Edge Function
- **Text-to-Speech prototype (Premium)** — generate speech with the Natural AI Voice selected in Settings, then play, rename, save, or share it from a persistent 10-file history
- **Text-to-speech** — tap the speaker icon on any card to hear the word or meaning read aloud; supports 10+ language locales
- Device text-to-speech is used on the Free plan; paid plans use Natural AI Voice

### Customization
- **Theme colors** — Blue (free), Purple, Pink, Teal, Coral (Basic plan)
- **Theme Shop (Kisekae)** — pick a solid color skin or a premium animated skin
- **Solid color skins** — 12 options: Blue (free), Green, Purple, Teal, Beige, Sky Blue, Mint, Pink, Red, Orange, Yellow, Gray (Basic plan)
- **Premium skins** — 15 skins with background images, blur overlays, and decorative effects: Deep Sea, Leaf Blur, Flower, Animal, Space, Sunset, Sakura, Galaxy, Snow Mountain, Cyber Neon, Coffee House, Beautiful Woods, Roses, Aurora, Rainy Window, Night City
- **Appearance** — Light / Dark / System modes
- **Level labels** — show/hide mastery indicators on card faces

### Subscription (Basic Plan)
- Unlimited words
- All theme colors and solid skins
- All premium skins
- Unlimited TTS plays

### App UI Language
- English, Japanese, Korean, Chinese (Simplified), Spanish, French, German, Italian, Portuguese (BR)

---

## Tech Stack

| Layer | Library / Service |
|---|---|
| Framework | Expo 54 / React Native 0.81.5 |
| Language | TypeScript 5.9 (strict) |
| Notifications | expo-notifications |
| Storage | @react-native-async-storage/async-storage |
| Icons | @expo/vector-icons (Ionicons) |
| Safe area | react-native-safe-area-context |
| Blur | expo-blur |
| Text-to-speech | expo-speech |
| Audio files / export | expo-file-system / expo-sharing |
| Backend / Sync | Supabase (anonymous auth + device data sync) |
| AI generation | OpenAI GPT-4o-mini |
| Subscription | AsyncStorage stub (RevenueCat / react-native-purchases required for real IAP) |

---

## Getting Started

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start the dev server (scan QR code with Expo Go)
npx expo start

# Run on iOS simulator
npx expo run:ios

# Run on Android emulator
npx expo run:android

# Run in browser (limited — notifications not available)
npx expo start --web
```

### Environment variables

Create a `.env.local` file in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-client-safe-anon-key
```

Never put the OpenAI key in an `EXPO_PUBLIC_` variable. Configure it only as a
Supabase Edge Function secret (`supabase secrets set OPENAI_API_KEY=...`) and
deploy `supabase/functions/openai`.

The Supabase anon key is designed for client use, but Row Level Security must
remain enabled. Never place a service-role key in the app.

---

## Project Structure

```
WordPing/
├── App.tsx                         # Root component — all state, handlers, and render
├── index.ts                        # Entry point (registerRootComponent)
├── src/
│   ├── types.ts                    # Shared TypeScript interfaces (WordCard, Folder, ThemeSkin, …)
│   ├── constants.ts                # Theme colors, skin configs, interval options, AsyncStorage keys
│   ├── styles.ts                   # Shared StyleSheet (appStyles)
│   ├── i18n.ts                     # Localisation — translations + useLang hook
│   ├── notifications.ts            # Permission request + notification scheduling (up to 64 slots)
│   ├── hooks/
│   │   └── useSubscription.ts      # Basic plan subscription state (AsyncStorage-backed)
│   ├── lib/
│   │   ├── db.ts                   # AsyncStorage persistence + Supabase sync
│   │   ├── tts.ts                  # Text-to-speech wrapper (expo-speech)
│   │   ├── generateMeaning.ts      # AI meaning / note generation via OpenAI
│   │   └── supabase.ts             # Supabase client + anonymous auth
│   └── components/
│       ├── SwipeableCard.tsx        # PanResponder card — flip animation, swipe-reveal actions, long-press menu
│       ├── SwipeableFolder.tsx      # Folder row with swipe-reveal edit/delete
│       ├── WordModal.tsx            # Add / edit word bottom sheet (word, meaning, note, lang, AI buttons)
│       ├── NotificationModal.tsx    # Notification interval picker + display-only-word toggle
│       ├── SettingsModal.tsx        # Theme color, appearance, skin, language, subscription settings
│       ├── KisekaeShopSheet.tsx     # Theme Shop — solid skins + premium skins picker
│       ├── SkinOverlays.tsx         # Decorative overlay effects rendered on top of cards (patterns, sparkles)
│       ├── SkinWallpaperOverlay.tsx # Full-screen wallpaper background for premium skins
│       ├── SkinPatternOverlay.tsx   # Repeating pattern layer (flowers, paws, stars) for skins
│       ├── FlipCardBrowser.tsx      # Full-screen one-at-a-time card flip mode
│       ├── TestModeScreen.tsx       # Multiple-choice quiz with mastery tracking and spaced repetition
│       ├── ReorderableList.tsx      # Drag-to-reorder card list
│       ├── AddFolderModal.tsx       # Create a new folder
│       ├── FolderActionSheet.tsx    # Folder long-press action menu (rename, customize, delete)
│       ├── FolderCustomizeModal.tsx # Folder icon and color customization
│       ├── FolderPickerSheet.tsx    # Move a card to a different folder
│       ├── ProSheet.tsx             # Basic plan upgrade sheet
│       ├── PaywallModal.tsx         # Paywall / plan comparison modal
│       ├── LanguageModal.tsx        # App UI language picker
│       ├── TutorialModal.tsx        # How-to-use guide (5 steps)
│       └── AdBannerPlaceholder.tsx  # Ad banner placeholder (future use)
└── website/                        # Next.js marketing site (deployed on Vercel)
    ├── app/
    │   ├── layout.tsx              # Root layout (pass-through — locale layout owns html/body)
    │   └── [locale]/
    │       ├── layout.tsx          # Locale layout — html, body, CSS import, next-intl provider
    │       └── page.tsx            # Landing page (Hero, Features, HowItWorks, Premium, CTA)
    ├── components/                 # Hero, Header, Features, HowItWorks, PremiumSection, DownloadCTA, Footer, PhoneMockup
    ├── messages/                   # 12 locale JSON files (en, ja, ko, zh, es, fr, de, pt, vi, id, th, ar)
    ├── i18n/                       # next-intl routing and request config
    ├── public/                     # Static assets (icon.png, images)
    ├── tailwind.config.ts
    └── next.config.ts
```

---

## Data Model

### WordCard
| Field | Type | Description |
|---|---|---|
| `id` | string | Unique ID |
| `word` | string | The vocabulary word |
| `meaning` | string | The meaning or translation |
| `note` | string | Optional extra note |
| `notifOff` | boolean? | True = excluded from notifications |
| `folderId` | string? | The folder this card belongs to |
| `wordLang` | string? | BCP-47 locale for TTS on the word side |
| `meaningLang` | string? | BCP-47 locale for TTS on the meaning side |
| `testLevel` | TestLevel? | Mastery: `perfect` / `good` / `slightly` / `unknown` |
| `testNextReview` | number? | Unix ms — skip in test queue until this time |

### Folder
| Field | Type | Description |
|---|---|---|
| `id` | string | Unique ID |
| `name` | string | Folder name |
| `createdAt` | number | Unix ms |
| `icon` | string? | Emoji icon |
| `color` | string? | Hex color |
| `notifSettings` | FolderNotifSettings? | `{ intervalSeconds, displayOnlyWord }` |

---

## iOS Bundle ID

`com.daiki0219.wordping`

---

## Notes

- Notification scheduling uses `expo-notifications`. Up to 64 slots are pre-scheduled on iOS.
- Real subscription (IAP) requires a native build with `react-native-purchases` (RevenueCat). The current implementation uses AsyncStorage as a development stub.
- The CNG workflow is used — `ios/` and `android/` are gitignored and regenerated by EAS Build.
