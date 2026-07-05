# CLAUDE.md — WordPing Development Guide

## 1. Project Overview

WordPing is a mobile vocabulary learning app built with Expo / React Native.

The main goal of the app is simple:

Users add words they want to remember, and WordPing helps them review those words through cards and notifications.

Do not make the app complicated. Keep it simple, clean, fast, and easy to understand.

---

## 2. Most Important Rule

Before changing code, always understand the current structure first.

Do not randomly rewrite large parts of the app.

When fixing a bug:
1. Find the real cause.
2. Change only the necessary files.
3. Do not break existing features.
4. Keep the UI consistent with the current design.

---

## 3. App Name

The app name is:

WordPing

Do not rename it.
Do not use old names like Vocabulary, Memora, or Wordloop.

---

## 4. Main Features

WordPing has these core features:

- Add vocabulary words
- Add meaning
- Add note
- Review words with flip cards
- Turn notification ON / OFF for words
- Open notification settings from the three-dots menu
- Customize appearance with theme colors and skins
- Basic plan unlocks more colors and premium skins

---

## 5. Three-Dots Menu

The three-dots menu must include:

1. Notification
2. Settings

The Notification item should appear above Settings.

Tapping Notification should open the notification settings sheet / modal.

Do not confuse this with the notification toggle on each word card.

---

## 6. Theme Color Rules

Free plan users can only use the blue theme color.

Free theme color:

#3B82F6

If a user downgrades from Basic to Free, and their selected theme color is not blue, reset it to blue automatically.

This check should happen:
- when the app starts
- when subscription state changes
- when settings are loaded

Never allow purple or other paid colors to remain active for Free users.

---

## 7. Skins / Theme Shop

The Theme Shop has two main categories:

- Solid colors
- Premium skins

Free users:
- Can only use the blue solid color

Basic users:
- Can use other solid colors
- Can use premium skins

Premium skin cards should preview the actual applied skin appearance.

This means the card should show:
- background image
- blur overlay
- decorative effects
- paw prints
- sparkles
- gradients
- any other real skin effects

Do not show only the raw background image.

The preview card should feel like a small version of the actual skin.

---

## 8. Premium Skin Performance

Do not re-render premium skin card images every time the Theme Shop opens.

Use performance optimizations such as:
- React.memo
- useMemo
- useCallback
- stable style objects
- stable skin config data
- image caching where appropriate

Opening the Theme Shop should feel smooth and instant.

---

## 9. Blur Rule

If a skin uses blur, the preview card must use the same blur strength as the actual applied skin.

Do not make the preview blur stronger than the real skin.

---

## 10. Word Card Rules

Word cards should remain simple and readable.

Front:
- Word
- Notification status if needed

Back:
- Meaning
- Note

Do not remove existing notification controls by accident.

Do not change the word card layout unless the task specifically asks for it.

---

## 11. Notification Rules

Notifications are an important feature of WordPing.

Do not remove:
- notification settings
- notification menu item
- per-word notification ON / OFF logic
- notification display settings

Expected notification menu:
- Open three-dots menu
- Tap Notification
- Notification settings opens

---

## 12. Add / Edit Word Sheet

The Add Word and Edit Word sheets should be clean and compact.

They include:
- Word
- Meaning
- Note
- Save
- Cancel

There may also be AI buttons for:
- generating meaning
- generating example sentences / notes

The translate / AI buttons should be placed close to the related input, not too far away.

---

## 13. Subscription / Basic Plan Rules

Basic plan unlocks:
- more theme colors
- premium skins
- more customization

Free plan should not show paid features as owned.

If a free user taps a locked color or premium skin, show the upgrade sheet.

Do not allow coin purchase logic for locked solid colors if the feature is subscription-based.

---

## 14. Website Rules

The website is separate from the Expo mobile app.

Website folder:

website/

Do not put website files randomly into the Expo app structure.

For website images, use:

website/public/

Example:

website/public/images/hero.png

In Next.js, use:

/images/hero.png

The website should be deployed on Vercel.

If Vercel deploys from the main WordPing repo, set Root Directory to:

website

---

## 15. Website Quality Standard

The WordPing website should look like a real product landing page.

It should include:
- Hero section
- WordPing app name
- clear tagline
- app screenshot or mockup
- feature cards
- how it works section
- Basic / Premium explanation
- Coming Soon App Store button

Do not make it look like default HTML.

If the page looks like:
- blue default links
- default select box
- unstyled layout
- plain white page

Then CSS / Tailwind is probably not loading.

Fix the root cause instead of redesigning randomly.

---

## 16. Git / Deploy Rule

Local changes are not enough.

For Vercel deployment:

1. Change files locally
2. git add .
3. git commit
4. git push origin main
5. Vercel auto-deploys from GitHub

If changes are not pushed, Vercel will still show the old version.

---

## 17. Coding Style

Keep code simple.

Avoid:
- unnecessary complexity
- huge rewrites
- random renaming
- deleting working features
- changing unrelated UI
- creating duplicate logic

Prefer:
- small components
- clear names
- reusable constants
- stable configs
- simple state logic

---

## 18. When Fixing Bugs

Always check:
- What worked before?
- What recently changed?
- Is it a rendering issue?
- Is it a condition issue?
- Is it a z-index / opacity issue?
- Is it a subscription state issue?
- Is it an AsyncStorage issue?
- Is it a CSS / Tailwind issue?
- Is it a Vercel root directory issue?

Do not guess blindly.

---

## 19. Communication Style

When explaining changes to me, use simple English.

Assume I am not an expert engineer.

Explain like this:

- What was broken
- Why it happened
- Which files you changed
- What the fix does
- How I can test it

Avoid overly technical explanations unless necessary.

---

## 20. Final Check Before Finishing

Before saying the task is done, confirm:

- App still runs
- No important feature disappeared
- Free / Basic plan rules still work
- Theme colors are correct
- Skins preview correctly
- Notification menu still exists
- Website builds if website files were changed
- No blank page on Vercel
- No unrelated files were changed

---

## 21. Technical Reference

### Commands

```bash
npm install --legacy-peer-deps   # install dependencies
npx expo start                   # start dev server (scan QR with Expo Go)
npx expo run:ios                 # build and run on iOS simulator
npx expo run:android             # build and run on Android emulator
npx expo start --web             # run in browser
```

No test runner is configured yet.

### Architecture

Entry point: `index.ts` → `registerRootComponent(App)` → `App.tsx`.

The main UI lives in `App.tsx`. New components go under `src/components/`. New screens or features use React Navigation (not Expo Router). Shared constants go in `src/constants.ts`. The `@/*` alias resolves to `./src/*` per `tsconfig.json`.

**Stack:** Expo 54, React Native 0.81.5, React 19, TypeScript 5.9 (strict mode).

**iOS bundle ID:** `com.daiki0219.english-app`

**Website:** Next.js 15 App Router, next-intl v3.26, Tailwind CSS v3, deployed on Vercel. Located in `website/`.
