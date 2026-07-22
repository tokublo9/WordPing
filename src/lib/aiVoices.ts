export const AI_VOICES = [
  'cedar',
  'fable',
  'alloy',
  'ash',
  'coral',
  'nova',
  'marin',
  'shimmer',
] as const;

export type AIVoice = typeof AI_VOICES[number];

export const DEFAULT_AI_VOICE: AIVoice = 'marin';

export const AI_VOICE_GROUPS: ReadonlyArray<{
  title: string;
  voices: readonly AIVoice[];
}> = [
  { title: 'Male · Cheerful', voices: ['cedar', 'fable'] },
  { title: 'Male · Calm', voices: ['alloy', 'ash'] },
  { title: 'Female · Cheerful', voices: ['coral', 'nova'] },
  { title: 'Female · Calm', voices: ['marin', 'shimmer'] },
];

const AI_VOICE_DESCRIPTIONS: Record<AIVoice, string> = {
  alloy: 'Balanced, clear, and versatile.',
  ash: 'Calm, steady, and reassuring.',
  cedar: 'Confident, natural, and grounded.',
  coral: 'Bright, friendly, and conversational.',
  fable: 'Expressive, animated, and story-friendly.',
  marin: 'Warm, natural, and engaging.',
  nova: 'Upbeat, polished, and energetic.',
  shimmer: 'Light, cheerful, and lively.',
};

export function isAIVoice(value: unknown): value is AIVoice {
  return typeof value === 'string' && (AI_VOICES as readonly string[]).includes(value);
}

export function getAIVoiceLabel(voice: AIVoice): string {
  return voice.charAt(0).toUpperCase() + voice.slice(1);
}

export function getAIVoiceDescription(voice: AIVoice): string {
  return AI_VOICE_DESCRIPTIONS[voice];
}
