"use client";

import { useState, useEffect } from "react";
import { ChatInterface, ChatMessageType } from "@/components/ui/chat-interface";
import { sendQueryToLLM, createUserMessage, createAssistantMessage, conversationStorage } from "@/lib/services/chat-service";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { v4 as uuidv4 } from "uuid";

export default function DashboardPage() {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [conversationId, setConversationId] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    const id = conversationStorage.generateConversationId();
    setConversationId(id);
    const storedMessages = conversationStorage.getStoredConversation(id);
    if (storedMessages.length > 0) {
      setMessages(storedMessages);
    }
  }, []);

  useEffect(() => {
    if (conversationId && messages.length > 0) {
      conversationStorage.storeConversation(conversationId, messages);
    }
  }, [messages, conversationId]);

  const handleSubmitQuery = async (query: string) => {
    try {
      const userMessage = createUserMessage(query);
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      
      const llmResponse = await sendQueryToLLM(query, messages);
      
      let actionPayload = undefined;
      if (llmResponse.proposedAction) {
        actionPayload = {
          ...llmResponse.proposedAction,
          id: `action-${uuidv4()}`
        };
      }

      const assistantMessage = {
        id: uuidv4(),
        content: llmResponse.content,
        isUser: false,
        timestamp: new Date(),
        sources: llmResponse.sources || [],
        ...(actionPayload && { action: actionPayload })
      };
      
      setMessages((prev) => [...prev, assistantMessage as ChatMessageType]);
    } catch (error) {
      console.error("Error submitting query:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get a response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    if (conversationId) {
      conversationStorage.clearStoredConversation(conversationId);
    }
    toast({
      title: "Conversation cleared",
      description: "Your conversation history has been cleared.",
    });
  };

  return (
    <div className="container mx-auto py-6 px-4 md:px-6 lg:px-8 h-[calc(100vh-4rem)] flex flex-col">
      <Card className="flex-1 overflow-hidden flex flex-col p-6 shadow-md">
        <ChatInterface
          onSubmitQuery={handleSubmitQuery}
          messages={messages}
          isLoading={isLoading}
          onClearChat={messages.length > 0 ? handleClearChat : undefined}
          waitingForResponse={isLoading}
        />
      </Card>
    </div>
  );
} 