import { useEffect, useState } from 'react';
import {
  getAIConsent,
  loadAIConsent,
  subscribeToAIConsent,
  type AIConsentState,
} from '../lib/aiConsent';

/**
 * The current AI data-sharing decision, as React state.
 *
 * Subscribes to the consent singleton so the Settings row, the dialog and any
 * other surface always agree — a decision made in the dialog updates the row
 * without either knowing about the other.
 */
export function useAIConsent(): AIConsentState {
  const [state, setState] = useState<AIConsentState>(getAIConsent);

  useEffect(() => {
    const unsubscribe = subscribeToAIConsent(setState);
    // Covers the case where nothing has read storage yet this launch; resolves
    // to the cached value immediately once it has.
    void loadAIConsent().then(setState);
    return unsubscribe;
  }, []);

  return state;
}
