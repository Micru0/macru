import { NextRequest, NextResponse } from 'next/server';
import { createLLMRouter } from '@/lib/llmRouter';
import { getApiKey, ServiceType } from '@/lib/credentials';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, model = 'gemini' } = body;
    
    if (!prompt) {
      return NextResponse.json(
        { error: 'Missing prompt parameter' },
        { status: 400 }
      );
    }
    
    // Get API key from credentials manager
    const apiKey = getApiKey(model as ServiceType);
    
    if (!apiKey) {
      return NextResponse.json(
        { error: `API key not configured for ${model}` },
        { status: 500 }
      );
    }
    
    // Create the LLM router with specified provider
    const router = createLLMRouter(model, apiKey);
    
    // Generate text
    const result = await router.generateText(prompt, {
      temperature: 0.7,
      maxTokens: 500
    });
    
    // Log the result before returning, especially if text is empty
    if (!result.text) {
      console.warn('LLM test endpoint received potentially empty response:', result);
    } else {
      console.log('LLM test endpoint received successful response.');
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in LLM test endpoint:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 