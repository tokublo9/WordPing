import { MAX_AI_INPUT_CHARS } from '../constants';
import { requestAIText, type AITextAction } from './openaiGateway';

function callOpenAI(action: AITextAction, text: string, langCode: string): Promise<string> {
  if (!text.trim()) return Promise.reject(new Error('input_empty'));
  if (text.length > MAX_AI_INPUT_CHARS) return Promise.reject(new Error('input_too_long'));
  return requestAIText(action, text, langCode);
}

export function generateMeaning(word: string, langCode: string): Promise<string> {
  return callOpenAI('meaning', word, langCode);
}

export function generateBreakdown(word: string, langCode: string): Promise<string> {
  return callOpenAI('breakdown', word, langCode);
}

export function translateText(text: string, langCode: string): Promise<string> {
  return callOpenAI('translation', text, langCode);
}

export function generateExample(word: string, langCode: string): Promise<string> {
  return callOpenAI('example', word, langCode);
}
