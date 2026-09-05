/**
 * Non-secret build identifier reported by the health endpoint.
 *
 * BUMP THIS WHENEVER THE WORKER'S BEHAVIOUR CHANGES, in the same commit.
 *
 * It was not bumped when `/v1/voice/promo` became anonymous, so the deployed
 * Worker and this repo reported the identical version while disagreeing about
 * whether that route requires an install id — and `/v1/health` could not tell
 * them apart. The promo previews were broken for as long as that went unnoticed.
 * The version string is the only way to confirm from outside which build is
 * live; a stale one makes it worse than useless.
 */
export const WORKER_VERSION = '2026-09-05.immediate-ai-voice-preload.1';
