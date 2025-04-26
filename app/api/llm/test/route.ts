import { NextRequest, NextResponse } from 'next/server';
import { LLMRouter, createLLMRouter } from '@/lib/llmRouter';
import { getApiKey } from '@/lib/credentials';

interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const { query, history = [] } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "No query provided" }, { status: 400 });
    }

    // Get the Gemini API Key
    const apiKey = getApiKey('gemini');
    
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }
    
    // Initialize the LLM router with the Gemini provider
    const router = createLLMRouter('gemini', apiKey);

    // Format history for the LLM context
    const formattedPrompt = formatPromptWithHistory(query, history);
    console.log(`Processing query: "${query}" with history of ${history.length} messages`);

    // Generate a response
    const response = await router.generateText(formattedPrompt, {
      temperature: 0.7,
      maxTokens: 1024,
    });

    return NextResponse.json({ response: response.text });
  } catch (error) {
    console.error("Error in LLM test route:", error);
    return NextResponse.json(
      { error: "Failed to process query" },
      { status: 500 }
    );
  }
}

function formatPromptWithHistory(query: string, history: HistoryItem[]): string {
  if (!history.length) {
    return query;
  }

  // Format conversation history
  const formattedHistory = history.map(item => {
    const role = item.role === 'user' ? 'User' : 'Assistant';
    return `${role}: ${item.content}`;
  }).join('\n\n');

  // Add the current query
  return `${formattedHistory}\n\nUser: ${query}\n\nAssistant:`;
} 