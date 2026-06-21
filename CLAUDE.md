# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install --legacy-peer-deps   # install dependencies
npx expo start                   # start dev server (scan QR with Expo Go)
npx expo run:ios                 # build and run on iOS simulator
npx expo run:android             # build and run on Android emulator
npx expo start --web             # run in browser
```

No test runner is configured yet.

## Architecture

Single-screen Expo app. The entire UI lives in `App.tsx` — there is no navigation library, no `src/` directory in use yet (though `@/*` resolves to `./src/*` per `tsconfig.json`), and no state management beyond `useState`.

Entry point: `index.ts` → `registerRootComponent(App)` → `App.tsx`.

**Stack:** Expo 54, React Native 0.81.5, React 19, TypeScript 5.9 (strict mode).

**iOS bundle ID:** `com.daiki0219.english-app`

When adding screens or features, reach for React Navigation (not Expo Router) unless the user specifies otherwise, and place new files under `src/`.
