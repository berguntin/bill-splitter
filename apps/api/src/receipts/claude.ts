import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Extractor } from './parser';
import { SYSTEM_PROMPT, USER_PROMPT } from './prompt';
import { ModelReceiptSchema } from './schema';

/** Extractor backed by the Claude API, using structured outputs for the answer. */
export function createClaudeExtractor(client: Anthropic): Extractor {
  return async ({ image, model, effort }) => {
    const response = await client.messages.parse({
      model,
      // Room for adaptive thinking plus a long receipt.
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      output_config: { effort, format: zodOutputFormat(ModelReceiptSchema) },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mediaType,
                data: image.data.toString('base64'),
              },
            },
            { type: 'text', text: USER_PROMPT },
          ],
        },
      ],
    });

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
    if (response.stop_reason === 'refusal') return { status: 'refused', usage };
    if (response.parsed_output === null) return { status: 'unreadable', usage };
    return { status: 'ok', answer: response.parsed_output, usage };
  };
}
