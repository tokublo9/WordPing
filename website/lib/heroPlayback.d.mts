export const HERO_STEPS: readonly ['word', 'meaning', 'test', 'result'];
export type HeroStep = (typeof HERO_STEPS)[number];
export const HERO_STEP_DURATION_MS: number;

export function nextHeroStep(currentStep: HeroStep): HeroStep;

export interface HeroPlayback {
  setVisible(value: boolean): void;
  setDocumentVisible(value: boolean): void;
  setReducedMotion(value: boolean): void;
  getStep(): HeroStep;
  dispose(): void;
}

export function createHeroPlayback(options: {
  onStep(step: HeroStep): void;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
  duration?: number;
}): HeroPlayback;
