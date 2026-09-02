/** The smallest player surface needed by deferred native cleanup. */
export interface RemovableAudioPlayer {
  remove(): void;
}

export type AudioCleanupScheduler = (cleanup: () => void) => void;

const pendingPlayers = new WeakSet<RemovableAudioPlayer>();

/**
 * Let the event that stopped playback finish and register its animation before
 * asking React Native to wait for interactions. Calling runAfterInteractions in
 * the same stack as Animated.start can race the animation's interaction handle.
 */
const scheduleAfterCurrentInteraction: AudioCleanupScheduler = cleanup => {
  setTimeout(() => {
    try {
      // Lazy so pure unit tests do not need the React Native runtime.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { InteractionManager } = require('react-native') as typeof import('react-native');
      void InteractionManager.runAfterInteractions(cleanup);
    } catch {
      // Non-RN/test environments have no interaction queue. This is still off
      // the caller's stack, which preserves the non-blocking stop contract.
      cleanup();
    }
  }, 0);
};

/**
 * Destroy a paused native player outside the interaction that stopped it.
 *
 * The WeakSet makes rapid repeated stops idempotent. The queued closure owns
 * only its player, so completing stale cleanup can never remove or mutate a
 * newer active player.
 */
export function deferAudioPlayerRemoval(
  player: RemovableAudioPlayer,
  schedule: AudioCleanupScheduler = scheduleAfterCurrentInteraction,
): void {
  if (pendingPlayers.has(player)) return;
  pendingPlayers.add(player);
  schedule(() => {
    if (!pendingPlayers.delete(player)) return;
    try { player.remove(); } catch {}
  });
}
