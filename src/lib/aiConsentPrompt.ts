import { getAIConsent, loadAIConsent, setAIConsent, type AIConsentState } from './aiConsent';

/**
 * The consent dialog channel.
 *
 * A module singleton for the same reason `topBanner.ts` is one: the callers are
 * scattered across word cards, Settings and the Upgrade sheet, and none of them
 * owns this state. Anything can ask for the dialog; exactly one mounted host
 * renders it.
 *
 * Hosts form a stack, and the most recently registered one wins. React Native
 * presents each `Modal` from its own native controller, so a dialog declared
 * outside the currently presented modal would be hidden behind it — the app
 * already duplicates `SettingsInfoPopup` for this reason. Each host registers
 * only while its own screen is actually on top, so the stack always resolves to
 * a host that can really be seen.
 *
 * Pure — no react-native import — so the routing and the "dismiss is not
 * consent" rule are tested directly.
 */

export interface AIConsentPromptHost {
  open(): void;
  close(): void;
}

let hosts: AIConsentPromptHost[] = [];
let pending: ((state: AIConsentState) => void) | null = null;

export function registerAIConsentPromptHost(host: AIConsentPromptHost): () => void {
  hosts = [...hosts, host];
  return () => {
    hosts = hosts.filter(entry => entry !== host);
    // A host that disappears mid-question (its screen was dismissed) must not
    // strand the caller waiting forever. No answer means no consent.
    if (pending !== null && !hosts.includes(host)) settle('unknown');
  };
}

/** Test seam — drops every host and abandons any open question. */
export function resetAIConsentPromptForTests(): void {
  hosts = [];
  pending = null;
}

export function isAIConsentPromptOpen(): boolean {
  return pending !== null;
}

function settle(state: AIConsentState): void {
  const resolve = pending;
  pending = null;
  hosts[hosts.length - 1]?.close();
  resolve?.(state);
}

/**
 * Shows the dialog and resolves with what the user chose.
 *
 * With no host mounted this resolves `unknown` rather than waiting: there is no
 * way to ask, so there is no consent, and the hard guard in `api/client.ts`
 * refuses the request a moment later.
 */
export function requestAIConsentDecision(): Promise<AIConsentState> {
  const host = hosts[hosts.length - 1];
  if (host === undefined) return Promise.resolve('unknown');
  // A second AI tap while the dialog is already up joins the open question
  // instead of stacking another dialog on top of it.
  if (pending !== null) {
    const previous = pending;
    return new Promise<AIConsentState>(resolve => {
      pending = state => { previous(state); resolve(state); };
    });
  }
  return new Promise<AIConsentState>(resolve => {
    pending = resolve;
    host.open();
  });
}

/**
 * Called by the dialog when the user picks Allow or Not Now.
 *
 * Persisting happens here so every host records the decision identically.
 */
export async function resolveAIConsentPrompt(state: 'granted' | 'declined'): Promise<void> {
  await setAIConsent(state);
  settle(state);
}

/**
 * Called when the dialog is dismissed without an answer — backdrop tap, the
 * Android back button, a swipe. Dismissal is never consent, and it is not a
 * decision either: nothing is written, so the next AI action asks again.
 */
export function dismissAIConsentPrompt(): void {
  settle('unknown');
}

/**
 * The one call every user-initiated AI action makes before doing anything.
 *
 * Returns true only for an explicit `granted`. A user who has previously
 * declined is asked again here — they just tapped an AI feature, which is
 * exactly the moment the question is meaningful — but nothing is sent unless
 * they say yes this time.
 */
export async function ensureAIConsentForUserAction(): Promise<boolean> {
  if (await loadAIConsent() === 'granted') return true;
  return await requestAIConsentDecision() === 'granted';
}

/** The current decision, for a caller that must not trigger a dialog. */
export function aiConsentSnapshot(): AIConsentState {
  return getAIConsent();
}
