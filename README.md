# WordPing

A vocabulary flashcard app for iOS built with Expo and React Native. Add words, flip cards to reveal meanings, and receive scheduled push notifications so you keep reviewing throughout the day.

## Features

- **Flashcards** — tap a card to flip it and reveal the meaning; swipe left to expose edit / delete actions
- **Notes** — attach an optional note to each word, shown on the card back
- **Push notifications** — receive word reminders at a custom interval (30 s – 2 h); up to 64 notifications pre-scheduled
- **Per-card mute** — swipe a card and tap the bell button to exclude it from notifications
- **Display Only Word** — optional mode that hides the meaning in notifications, showing only the word
- **Theme colors** — 8 accent colors to choose from
- **Appearance** — Light / Dark / System modes
- **20-word cap** — designed for focused study sets (subscription expansion planned)
- **Tutorial** — tap the `?` icon in the header for a quick how-to guide

## Tech stack

| Layer | Library |
|---|---|
| Framework | Expo 54 / React Native 0.81.5 |
| Language | TypeScript 5.9 (strict) |
| Notifications | expo-notifications |
| Storage | @react-native-async-storage/async-storage |
| Icons | @expo/vector-icons (Ionicons) |
| Safe area | react-native-safe-area-context |

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
App.tsx          # Root component — state, handlers, render
index.ts         # Entry point (registerRootComponent)
src/
  types.ts       # Shared TypeScript interfaces
  constants.ts   # Palette, interval options, AsyncStorage keys
  styles.ts      # Shared StyleSheet (appStyles)
  notifications.ts  # Permission request + notification scheduling
  components/
    SwipeableCard.tsx     # PanResponder card with flip + swipe-reveal actions
    WordModal.tsx         # Add / edit word bottom sheet
    NotificationModal.tsx # Notification interval picker bottom sheet
    SettingsModal.tsx     # Theme color + appearance picker
    TutorialModal.tsx     # How-to-use guide
```

## iOS bundle ID

`com.daiki0219.english-app`
