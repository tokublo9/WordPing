import type { Feature } from '../config';
import { jsonResponse } from '../http';
import { log } from '../log';
import { requestText, type TextAction } from '../openai';
import { guard, type GuardContext } from '../pipeline';
import { textActionSchema } from '../schemas';

/**
 * The four GPT-backed text endpoints. They differ only in the system prompt
 * selected server-side from the route, so one handler covers all of them —
 * and a client cannot choose a prompt, model, or temperature.
 */
export function handleTextAction(
  context: GuardContext,
  feature: Extract<Feature, TextAction>,
): Promise<Response> {
  return (async () => {
    const result = await guard(context, {
      feature,
      schema: textActionSchema,
      billableText: body => body.text,
    });
    if (!result.ok) return result.response;

    const { body, characters } = result.value;
    const text = await requestText(
      {
        apiKey: context.env.OPENAI_API_KEY,
        action: feature,
        text: body.text,
        timeoutMs: context.resolved.textTimeoutMs,
        localMock: context.localAiVoiceTestScenario !== null,
        ...(body.langCode !== undefined ? { langCode: body.langCode } : {}),
      },
      context.response.requestId,
    );

    // Input and output sizes only. Neither the prompt nor the completion is logged.
    log('info', 'text_action_ok', context.response.requestId, {
      feature, characters, outputCharacters: text.length,
    });
    return jsonResponse(context.response, { text });
  })();
}
