# WordPing

A vocabulary learning app for iOS built with Expo and React Native. Add words, flip cards to reveal meanings, and receive scheduled push notifications so you keep reviewing throughout the day.

## Features

- **Flashcards** — tap a card to flip it and reveal the meaning; swipe left to expose edit / delete / move actions
- **Folders** — organize words into folders, each with its own notification schedule
- **Notes** — attach an optional note to each word, shown on the card back
- **Push notifications** — receive word reminders at a custom interval; configure per folder
- **Per-card mute** — exclude individual words from notifications via swipe-reveal or long-press menu
- **Display Only Word** — hide the meaning in notifications, showing only the word
- **Test mode** — multiple-choice quiz to test recall
- **Flip / Reorder mode** — bulk-flip or manually reorder cards
- **AI meaning generation** — auto-generate meanings and example notes
- **Theme Shop (Kisekae)** — solid accent colors and premium animated skins
- **Skins** — premium visual themes with background images, blur overlays, and decorative effects
- **Appearance** — Light / Dark / System modes
- **Multi-language UI** — 12 supported languages
- **Basic plan** — unlocks additional theme colors and premium skins

## Tech stack

| Layer | Library |
|---|---|
| Framework | Expo 54 / React Native 0.81.5 |
| Language | TypeScript 5.9 (strict) |
| Notifications | expo-notifications |
| Storage | @react-native-async-storage/async-storage |
| Icons | @expo/vector-icons (Ionicons) |
| Safe area | react-native-safe-area-context |
| Blur | expo-blur |
| Backend | Supabase |
| TTS | expo-speech |

## Getting started

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start the dev server (scan QR with Expo Go)
npx expo start

# Run on iOS simulator
npx expo run:ios

# Run on Android emulator
npx expo run:android

# Run in browser
npx expo start --web
```

## Project structure

```
App.tsx              # Root component — state, handlers, render
index.ts             # Entry point (registerRootComponent)
src/
  types.ts           # Shared TypeScript interfaces
  constants.ts       # Palette, interval options, skin configs, AsyncStorage keys
  styles.ts          # Shared StyleSheet (appStyles)
  i18n.ts            # Localisation hook (useLang)
  notifications.ts   # Permission request + notification scheduling
  hooks/
    useSubscription.ts       # Basic plan subscription state
  lib/
    db.ts                    # AsyncStorage persistence helpers
    tts.ts                   # Text-to-speech wrapper
    generateMeaning.ts       # AI meaning generation
    supabase.ts              # Supabase client
  components/
    SwipeableCard.tsx        # PanResponder card with flip + swipe-reveal actions
    SwipeableFolder.tsx      # Swipeable folder row
    WordModal.tsx            # Add / edit word sheet
    NotificationModal.tsx    # Notification interval picker sheet
    SettingsModal.tsx        # Theme color + appearance + skin picker
    KisekaeShopSheet.tsx     # Theme Shop (colors + premium skins)
    SkinOverlays.tsx         # Skin visual effects rendered on top of cards
    SkinWallpaperOverlay.tsx # Full-screen wallpaper background for skins
    SkinPatternOverlay.tsx   # Pattern/texture overlay for skins
    FlipCardBrowser.tsx      # Flip-through card review mode
    TestModeScreen.tsx       # Multiple-choice test mode
    ReorderableList.tsx      # Drag-to-reorder card list
    AddFolderModal.tsx       # Create new folder
    FolderActionSheet.tsx    # Folder long-press actions
    FolderCustomizeModal.tsx # Folder name / color customization
    FolderPickerSheet.tsx    # Move a card to a different folder
    ProSheet.tsx             # Basic plan upgrade sheet
    PaywallModal.tsx         # Paywall / subscription modal
    LanguageModal.tsx        # UI language picker
    TutorialModal.tsx        # How-to-use guide
website/             # Next.js marketing site (deployed on Vercel)
```

## iOS bundle ID

`com.daiki0219.english-app`
