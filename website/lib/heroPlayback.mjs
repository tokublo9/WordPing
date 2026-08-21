export const HERO_STEPS = ['word', 'meaning', 'test', 'result'];
export const HERO_STEP_DURATION_MS = 2500;

export function nextHeroStep(currentStep) {
  const currentIndex = HERO_STEPS.indexOf(currentStep);
  return HERO_STEPS[(currentIndex + 1) % HERO_STEPS.length];
}

/**
 * Small timer controller used by the hero and its lifecycle tests.
 * It schedules one state change per readable stage rather than updating React
 * on every animation frame.
 */
export function createHeroPlayback({
  onStep,
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  cancel = timer => globalThis.clearTimeout(timer),
  duration = HERO_STEP_DURATION_MS,
}) {
  let step = HERO_STEPS[0];
  let visible = false;
  let documentVisible = true;
  let reducedMotion = false;
  let disposed = false;
  let timer = null;

  const stop = () => {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  };

  const shouldPlay = () => visible && documentVisible && !reducedMotion && !disposed;

  const queue = () => {
    stop();
    if (!shouldPlay()) return;
    timer = schedule(() => {
      timer = null;
      if (!shouldPlay()) return;
      step = nextHeroStep(step);
      onStep(step);
      queue();
    }, duration);
  };

  const resetForReducedMotion = () => {
    if (step !== HERO_STEPS[0]) {
      step = HERO_STEPS[0];
      onStep(step);
    }
  };

  return {
    setVisible(value) {
      visible = value;
      queue();
    },
    setDocumentVisible(value) {
      documentVisible = value;
      queue();
    },
    setReducedMotion(value) {
      reducedMotion = value;
      if (value) resetForReducedMotion();
      queue();
    },
    getStep() {
      return step;
    },
    dispose() {
      disposed = true;
      stop();
    },
  };
}
