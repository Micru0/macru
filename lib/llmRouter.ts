// LLM Router - Provides a unified interface for interacting with different LLM providers
// Starting with Gemini 2.5 Pro integration

import { ActionRequest } from '@/lib/types/action'; // Import ActionRequest

// Types and interfaces
export interface LLMResponse {
  text?: string; // Make text optional
  actionRequest?: ActionRequest; // Add field for action proposal
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

// Interface that all LLM providers must implement
export interface LLMProvider {
  modelName: string;
  generate(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse>;
  countTokens(text: string): Promise<number>;
}

export interface LLMRequestOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  user?: string;
}

// Gemini Provider implementation
export class GeminiProvider implements LLMProvider {
  modelName: string;
  apiKey: string;

  constructor(apiKey: string, modelName: string = "gemini-2.5-pro-preview-03-25") {
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  // Format the prompt for Gemini
  private formatPrompt(prompt: string): any {
    return {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    };
  }

  // Calculate approximate token count (actual implementation would use Gemini API)
  async countTokens(text: string): Promise<number> {
    // Simple approximation: 1 token ~= 4 characters
    return Math.ceil(text.length / 4);
  }

  // Define the tool schema for Gemini
  private getTools(): any[] {
    // Define tools available based on provider capabilities or specific needs
    // Example: Add tools for Google provider if it's selected
    if (this.modelName === 'gemini-2.5-pro-preview-03-25') {
        // Gemini supports function calling
    return [
            // Add other Gemini-compatible tools here if needed
      {
              functionDeclarations: [
          {
            name: 'googleCalendar.createEvent',
                    description: 'Creates a new event on the user\'s primary Google Calendar.',
            parameters: {
                        type: 'OBJECT',
              properties: {
                            summary: { type: 'STRING', description: 'The title or summary of the event.' },
                            startDateTime: { type: 'STRING', description: 'The start date and time in ISO 8601 format (e.g., \"2025-05-14T16:00:00-07:00\"). Timezone is important.' },
                            endDateTime: { type: 'STRING', description: 'The end date and time in ISO 8601 format (e.g., \"2025-05-14T17:00:00-07:00\"). Required if duration is not provided.' },
                            // duration: { type: 'STRING', description: 'Event duration in ISO 8601 format (e.g., \"PT1H\" for 1 hour). Use instead of endDateTime if preferred.' },
                            attendees: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Optional. An array of email addresses for attendees to invite.' },
                            description: { type: 'STRING', description: 'Optional. A longer description or notes for the event.' },
                            location: { type: 'STRING', description: 'Optional. The location of the event.' }
              },
                        required: ['summary', 'startDateTime'] // Require summary and start. End/duration logic handled later.
                    }
                }
                // Add other function declarations here
              ]
            }
    ];
    } else {
        // Return empty array or tools compatible with other providers
        return [];
    }
  }

  // Generate response (text or action) from Gemini API
  // Renamed from generateText
  async generate(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse> {
    try {
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        tools: this.getTools(), // Include the tool definitions
        generation_config: {
          temperature: options?.temperature ?? 0.7,
          max_output_tokens: options?.maxTokens || 1024,
          top_p: options?.topP ?? 0.95,
          top_k: options?.topK ?? 40,
          // TODO: Add stop sequences if needed
        },
      };

      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(requestBody),
      };

      // Note: Using the same generateContent endpoint, Gemini infers tool use from the 'tools' field
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent`,
        requestOptions
      );

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Gemini API Error Body:', errorBody);
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];

      if (!candidate) {
        throw new Error('No candidate found in Gemini response');
      }

      // Calculate token usage (approximation) - BEFORE checking for function call
      // Note: Actual token calculation for function calls might differ.
      // This is a placeholder; a dedicated token counting function might be needed.
      const promptTokens = await this.countTokens(prompt); // Approx
      let completionTokens = 0;
      let responseText: string | undefined = undefined;
      let actionRequest: ActionRequest | undefined = undefined;
      let finishReason = candidate.finishReason || 'STOP';

      // Check if the response contains a function call (action proposal)
      const functionCall = candidate.content?.parts?.[0]?.functionCall;

      if (functionCall) {
        console.log('[GeminiProvider] Received function call:', functionCall);
        finishReason = 'TOOL_USE'; // Or FUNCTION_CALL depending on Gemini's specific reason
        actionRequest = {
          type: functionCall.name,
          parameters: functionCall.args || {},
          // metadata: {} // TODO: Add any relevant metadata if needed
        };
        // Estimate completion tokens for function call (rough approximation)
        completionTokens = await this.countTokens(JSON.stringify(functionCall)); 
      } else {
        // Regular text response
        responseText = candidate.content?.parts?.[0]?.text || '';
        // Only count tokens if there is response text
        completionTokens = responseText ? await this.countTokens(responseText) : 0;
      }

      return {
        text: responseText,
        actionRequest: actionRequest,
        model: this.modelName,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        finishReason: finishReason,
      };
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      throw error;
    }
  }
}

// LLM Router - factory and main interface
export class LLMRouter {
  private provider: LLMProvider;
  
  constructor(provider: LLMProvider) {
    this.provider = provider;
  }
  
  // Set or change the LLM provider
  setProvider(provider: LLMProvider) {
    this.provider = provider;
  }
  
  // Get the current provider
  getProvider(): LLMProvider {
    return this.provider;
  }
  
  // Generate response (text or action) using the current provider
  // Renamed from generateText
  async generate(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse> {
    return this.provider.generate(prompt, options);
  }
  
  // Count tokens for a given text
  async countTokens(text: string): Promise<number> {
    return this.provider.countTokens(text);
  }
}

// Factory function to create an LLM router with the appropriate provider
export function createLLMRouter(providerType: string, apiKey: string): LLMRouter {
  switch (providerType.toLowerCase()) {
    case 'gemini':
      return new LLMRouter(new GeminiProvider(apiKey));
    default:
      throw new Error(`Unsupported LLM provider: ${providerType}`);
  }
}

// Example usage:
// const router = createLLMRouter('gemini', 'YOUR_API_KEY');
// const response = await router.generateText('Tell me about AI'); 