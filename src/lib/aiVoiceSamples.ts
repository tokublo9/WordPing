import {
  AI_SPEECH_FORMAT,
  AI_SPEECH_MODEL,
  AI_SPEECH_SPEED,
} from './ttsRequest';
import { AI_VOICES, getAIVoiceLabel, type AIVoice } from './aiVoices';

/** Increment whenever the fixed preview copy or its generation settings change. */
export const AI_VOICE_SAMPLE_CONTENT_VERSION = 'natural-ai-voice-v1';
export const AI_VOICE_SAMPLE_PRELOAD_CONCURRENCY = 2;

export interface AIVoiceSample {
  id: AIVoice;
  text: string;
  voice: AIVoice;
  model: typeof AI_SPEECH_MODEL;
  speed: typeof AI_SPEECH_SPEED;
  format: typeof AI_SPEECH_FORMAT;
  contentVersion: typeof AI_VOICE_SAMPLE_CONTENT_VERSION;
}

export const AI_VOICE_SAMPLES: readonly AIVoiceSample[] = AI_VOICES.map(voice => ({
  id: voice,
  text: `Welcome to WordPing. This is the ${getAIVoiceLabel(voice)} voice.`,
  voice,
  model: AI_SPEECH_MODEL,
  speed: AI_SPEECH_SPEED,
  format: AI_SPEECH_FORMAT,
  contentVersion: AI_VOICE_SAMPLE_CONTENT_VERSION,
}));

export function getAIVoiceSample(voice: AIVoice): AIVoiceSample {
  const sample = AI_VOICE_SAMPLES.find(candidate => candidate.voice === voice);
  if (!sample) throw new Error('voice_sample_unavailable');
  return sample;
}

export function isAIVoiceSamplePreloadEligible(plan: 'free' | 'basic' | 'premium'): boolean {
  return plan === 'basic' || plan === 'premium';
}
