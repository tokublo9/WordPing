# WordPing Production Audit Report

This report summarizes the production readiness review of WordPing and the fixes applied during the audit. It is intentionally written as an engineering handoff rather than a changelog.

1. Overall assessment

WordPing is materially stronger than it was at the start of the audit. The app now has safer AI request handling, more reliable audio control, better startup behavior, stronger type checking, and several cleanup passes that reduce technical debt. The remaining blockers are not cosmetic: subscription enforcement, true cross-device sync, and public legal/site hygiene still need to be completed before the app should be treated as production-ready.

2. Prioritized problems

Critical:

- Client-side AI access was exposed through a public API key path. That creates avoidable cost and control risk, so AI requests must stay on the server boundary.
- Premium access is still not verified by a trusted backend entitlement. Local-only subscription state can be bypassed.
- Cross-device transfer is not a real replicated sync system yet. It behaves like device-local storage with partial restore behavior.

High:

- The marketing/legal site is incomplete. Legal links are not routed to real pages, and the public site could not be validated end to end.
- Supabase hosted migration state and production-side configuration were not fully verifiable from the local environment.
- Some startup and sync paths still depend on implicit assumptions about account state, which is fragile for a production launch.

Medium:

- The bundle still contains a lot of media assets, which makes the exported app larger than ideal.
- A number of user-facing strings are still hard-coded and should move into the translation system.
- Some fallback and legacy code paths remain in place because replacing them would have introduced unnecessary migration risk.

Low:

- Residual type assertions and old patterns remain where they do not materially affect correctness.
- A few design and copy inconsistencies remain outside the main risk areas.

3. Root causes

- Sensitive operations were allowed to originate from the client instead of being forced through a trusted server boundary.
- App monetization state was modeled as a local convenience flag rather than as an entitlement that must be verified.
- Persistence and sync were built incrementally around local-first behavior, but without a formal conflict strategy.
- Operational concerns such as legal pages, production secrets, and hosted migration verification were not fully closed before release readiness work started.

4. Files changed and why

- `src/lib/openaiGateway.ts` and `supabase/functions/openai/index.ts`: moved OpenAI traffic into an authenticated Supabase Edge Function with explicit request validation.
- `src/lib/audioFocus.ts`: centralized playback ownership so tapping an active voice control actually stops the audio, not just the UI icon.
- `src/lib/db.ts`, `src/lib/supabase.ts`, `src/notifications.ts`, `src/features/cards/useCards.ts`, `src/features/folders/useFolders.ts`, and related hooks: tightened startup, restore, scheduling, and retry behavior.
- `src/components/WordModal.tsx`, `src/components/SwipeableCard.tsx`, `src/components/TextToSpeechScreen.tsx`, `src/components/ProSheet.tsx`, and related UI files: aligned playback behavior and reduced inconsistent state handling.
- `src/utils/createId.ts`: replaced time-based identifiers with a safer helper to reduce collision risk.
- `app.json`, `tsconfig.json`, `package.json`, `package-lock.json`, `website/package.json`, and `website/next.config.ts`: tightened permissions, validation, build behavior, and security headers.
- `README.md`, `CLAUDE.md`: updated project guidance to match the current architecture and operational expectations.

5. Performance improvements made

- Reduced unnecessary AI preloading so speech requests are made only when a user action requires them.
- Virtualized the main list rendering path instead of keeping the full list inside a scroll view.
- Coalesced repeated persistence and notification work to avoid redundant writes and schedule churn.
- Deferred some expensive sheet preloading until the relevant UI is actually opened.
- Avoided several repeated filter and recomputation paths in list and folder rendering.

6. Security improvements made

- Removed client-side exposure of the OpenAI key path and replaced it with a server-side function.
- Added JWT validation and input allowlists in the Edge Function.
- Removed unnecessary microphone/audio-recording exposure from app permissions.
- Added safer external link handling and stricter website headers.
- Scanned the repository and export output for obvious secret leakage and confirmed no committed OpenAI secret is present.

7. Maintainability improvements made

- Consolidated duplicate audio state into a single ownership model.
- Reduced duplicated IDs and ad hoc identity generation.
- Removed dead UI fragments, unused imports, and abandoned logic paths.
- Strengthened TypeScript checking and validation scripts so regressions surface earlier.
- Simplified several data flows so state is represented once instead of being mirrored in multiple places.

8. Problems that remain

- Subscription verification still needs a trusted server or billing provider integration.
- Cross-device sync still needs a real design for conflict handling, ownership, and recovery.
- Some hard-coded UI strings and a few i18n gaps remain.
- The asset bundle is still heavier than it should be for a polished production release.

9. External actions required

- Rotate the OpenAI secret and store it server-side in Supabase secrets.
- Deploy the Supabase Edge Function after the production secret is configured.
- Publish the legal pages and wire the footer links to real destinations.
- Verify hosted Supabase migrations with authenticated CLI access.
- Implement and validate server-side entitlement checks.

10. Verification run

- `npm run typecheck -- --pretty false`
- `npx tsc --noEmit --pretty false --noUnusedLocals --noUnusedParameters`
- `npm run validate`
- `npx expo-doctor`
- `npx expo config --type public`
- `npx expo config --type introspect`
- `npm ls --depth=0`
- `npm audit --omit=dev`
- Website TypeScript build with Node 20
- Website production build
- `git diff --check`

The local checks that were able to run completed successfully.

11. Areas not fully verified

- No physical iOS or Android device run was performed.
- Supabase hosted migration state was not fully verified because the CLI did not have an access token.
- The new Edge Function was not executed against the deployed production environment.
- Automated test coverage is still thin, so a number of behaviors were validated by code inspection and targeted runtime checks instead of formal tests.

12. Recommended next steps

1. Implement server-backed subscription entitlement checks.
2. Finish the legal pages and public routing.
3. Design and implement real cross-device sync.
4. Add focused tests for persistence, notifications, and audio playback.
5. Continue trimming the asset bundle and move remaining hard-coded strings into localization.
