const LANG_NAMES: Record<string, string> = {
  'en-US': 'English',
  'es':    'Spanish',
  'fr':    'French',
  'ja':    'Japanese',
  'ko':    'Korean',
  'zh-CN': 'Chinese (Simplified)',
  'de':    'German',
  'it':    'Italian',
  'pt-BR': 'Portuguese',
  'ru':    'Russian',
  'ar':    'Arabic',
  'hi':    'Hindi',
  'tr':    'Turkish',
  'nl':    'Dutch',
  'vi':    'Vietnamese',
  'th':    'Thai',
  'id':    'Indonesian',
  'pl':    'Polish',
  'el':    'Greek',
  'sv':    'Swedish',
};

const MAX_AI_INPUT = 500;

async function callOpenAI(messages: Array<{ role: string; content: string }>): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) throw new Error('EXPO_PUBLIC_OPENAI_API_KEY is not set');

  const capped = messages.map(m =>
    m.role === 'user' && m.content.length > MAX_AI_INPUT
      ? { ...m, content: m.content.slice(0, MAX_AI_INPUT) }
      : m
  );

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: capped, max_tokens: 150, temperature: 0.5 }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('quota_exceeded');
    throw new Error(`OpenAI error: ${res.status}`);
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return (data.choices?.[0]?.message?.content ?? '').trim();
}

export function generateMeaning(word: string, langCode: string): Promise<string> {
  const langName = LANG_NAMES[langCode] ?? 'English';
  return callOpenAI([
    {
      role: 'system',
      content: `Translate the following into ${langName}. Return only the translated text, nothing else.`,
    },
    { role: 'user', content: word },
  ]);
}

export function generateBreakdown(word: string, langCode: string): Promise<string> {
  const langName = LANG_NAMES[langCode] ?? 'English';
  return callOpenAI([
    {
      role: 'system',
      content: `You are a language learning assistant. Break the given word or phrase into natural, meaningful parts and translate each part into ${langName}. Format each item as "original: translation" on its own line. Group words into natural phrases instead of splitting every single word. Be concise and clear.`,
    },
    { role: 'user', content: word },
  ]);
}

export function translateText(text: string, langCode: string): Promise<string> {
  const langName = LANG_NAMES[langCode] ?? 'English';
  return callOpenAI([
    {
      role: 'system',
      content: `Translate the following text into ${langName}. Return only the translated text, nothing else.`,
    },
    { role: 'user', content: text },
  ]);
}

export function generateExample(word: string, langCode: string): Promise<string> {
  const langName = LANG_NAMES[langCode] ?? 'English';
  return callOpenAI([
    {
      role: 'system',
      content: `You are a vocabulary teacher. Write one very short example sentence in ${langName} using the given word. The sentence must be under 10 words. Return only the sentence, nothing else.`,
    },
    { role: 'user', content: word },
  ]);
}
