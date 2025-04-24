// LLM Router - Provides a unified interface for interacting with different LLM providers
// Starting with Gemini 2.5 Pro integration

// Types and interfaces
export interface LLMResponse {
  text: string;
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
  generateText(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse>;
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

  // Generate text from Gemini API
  async generateText(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse> {
    try {
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey
        },
        body: JSON.stringify({
          ...this.formatPrompt(prompt),
          generation_config: {
            temperature: options?.temperature || 0.7,
            max_output_tokens: options?.maxTokens || 1024,
            top_p: options?.topP || 0.95,
            top_k: options?.topK || 40
          }
        })
      };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent`,
        requestOptions
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Extract response text
      const text = data.candidates[0]?.content?.parts[0]?.text || '';
      
      // Calculate token usage (approximation)
      const promptTokens = await this.countTokens(prompt);
      const completionTokens = await this.countTokens(text);
      
      return {
        text,
        model: this.modelName,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens
        },
        finishReason: data.candidates[0]?.finishReason || 'STOP'
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
  
  // Generate text using the current provider
  async generateText(prompt: string, options?: LLMRequestOptions): Promise<LLMResponse> {
    return this.provider.generateText(prompt, options);
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