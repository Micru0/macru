"use client";

import { useState, useEffect, useRef } from "react";
import { QueryBox } from "./query-box";
import { ChatMessage } from "./chat-message";
import { Button } from "./button";
import { RotateCcw } from "lucide-react";

export type ChatMessage = {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  sources?: {
    title: string;
    content?: string;
    url?: string;
  }[];
};

export interface ChatInterfaceProps {
  onSubmitQuery: (query: string) => Promise<void>;
  messages: ChatMessage[];
  isLoading?: boolean;
  onClearChat?: () => void;
  waitingForResponse?: boolean;
}

export function ChatInterface({
  onSubmitQuery,
  messages,
  isLoading = false,
  onClearChat,
  waitingForResponse = false,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [initialRender, setInitialRender] = useState(true);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current && (!initialRender || messages.length > 0)) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
    if (initialRender) {
      setInitialRender(false);
    }
  }, [messages, initialRender]);

  const handleSubmit = async (query: string) => {
    await onSubmitQuery(query);
  };

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <h2 className="text-2xl font-bold">Welcome to MACRU</h2>
            <p className="text-muted-foreground mt-2 max-w-md">
              Ask me anything about your documents and uploaded files. I'll use them to provide personalized answers.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message.content}
              isUser={message.isUser}
              timestamp={message.timestamp}
              sources={message.sources}
            />
          ))
        )}

        {waitingForResponse && (
          <ChatMessage
            message=""
            isUser={false}
            isLoading={true}
          />
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t">
        {messages.length > 0 && onClearChat && (
          <div className="flex justify-center mb-4">
            <Button
              variant="outline" 
              size="sm"
              onClick={onClearChat}
              className="text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-2" />
              Clear conversation
            </Button>
          </div>
        )}
        <QueryBox
          onSubmit={handleSubmit}
          isLoading={isLoading || waitingForResponse}
          onReset={messages.length > 0 ? onClearChat : undefined}
        />
      </div>
    </div>
  );
} 