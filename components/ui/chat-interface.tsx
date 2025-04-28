"use client";

import { useState, useEffect, useRef } from "react";
import { QueryBox } from "./query-box";
import { ChatMessage as ChatMessageDisplay } from "./chat-message";
import { ProposedAction } from "@/components/actions/ProposedAction";
import { ActionConfirmationDialog } from "@/components/actions/ActionConfirmationDialog";
import { ActionStatusIndicator } from "@/components/actions/ActionStatusIndicator";
import { Button } from "./button";
import { RotateCcw } from "lucide-react";
import type { ProposedActionType } from "@/lib/types/action";
import { useToast } from "@/components/ui/use-toast";
import { v4 as uuidv4 } from 'uuid';

export type ChatMessageType = {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  sources?: {
    title: string;
    content?: string;
    url?: string;
  }[];
  action?: ProposedActionType;
};

type ActionStatus = 'pending' | 'executing' | 'success' | 'failed';

export interface ChatInterfaceProps {
  onSubmitQuery: (query: string) => Promise<void>;
  messages: ChatMessageType[];
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
  const { toast } = useToast();

  const [selectedAction, setSelectedAction] = useState<ProposedActionType | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [actionStatuses, setActionStatuses] = useState<Record<string, { status: ActionStatus; message?: string }>>({});

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

  const handleShowConfirmDialog = (actionId: string) => {
    const messageWithAction = messages.find(msg => msg.action?.id === actionId);
    if (messageWithAction?.action) {
      setSelectedAction(messageWithAction.action);
      setIsConfirmDialogOpen(true);
    } else {
      console.error(`Action with ID ${actionId} not found in messages.`);
      toast({ title: "Error", description: "Could not find the action to confirm.", variant: "destructive" });
    }
  };

  const handleRejectAction = (actionId: string) => {
    console.log("Action rejected:", actionId);
    setActionStatuses(prev => ({ ...prev, [actionId]: { status: 'failed', message: 'Rejected by user' } }));
    toast({ title: "Action Rejected", description: `Action ${actionId.substring(0, 8)}... was rejected.` });
  };

  const handleExecuteAction = async (actionId: string) => {
    if (!selectedAction || selectedAction.id !== actionId) {
      console.error("Mismatch between selected action and action ID to execute.");
      toast({ title: "Error", description: "Action execution mismatch.", variant: "destructive" });
      return;
    }

    setActionStatuses(prev => ({ ...prev, [actionId]: { status: 'executing' } }));
    setIsConfirmDialogOpen(false);

    try {
      console.log(`Executing action ${actionId} with type ${selectedAction.type}`);
      const response = await fetch('/api/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: selectedAction.type,
          parameters: selectedAction.parameters,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `API Error: ${response.statusText}`);
      }

      if (result.success) {
        setActionStatuses(prev => ({ ...prev, [actionId]: { status: 'success', message: result.message } }));
        toast({ title: "Action Successful", description: result.message || `Action ${actionId.substring(0,8)}... completed.` });
      } else {
        throw new Error(result.error || 'Action execution failed.');
      }
    } catch (error) {
      console.error("Action execution failed:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setActionStatuses(prev => ({ ...prev, [actionId]: { status: 'failed', message: errorMessage } }));
      toast({ title: "Action Failed", description: errorMessage, variant: "destructive" });
    } finally {
      setSelectedAction(null);
    }
  };

  const handleCancelDialog = () => {
    setIsConfirmDialogOpen(false);
    setSelectedAction(null);
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
          messages.map((message) => {
            const actionId = message.action?.id || (message.action ? `temp-${uuidv4()}` : undefined);
            const actionWithId = message.action ? { ...message.action, id: actionId! } : undefined;

            return (
              <div key={message.id}>
                {actionWithId ? (
                  <>
                    <ProposedAction
                      action={actionWithId}
                      onConfirm={handleShowConfirmDialog}
                      onReject={handleRejectAction}
                    />
                    {actionStatuses[actionWithId.id] &&
                      actionStatuses[actionWithId.id].status !== 'pending' && (
                        <ActionStatusIndicator
                          status={actionStatuses[actionWithId.id].status}
                          message={actionStatuses[actionWithId.id].message}
                        />
                      )}
                  </>
                ) : (
                  <ChatMessageDisplay
                    message={message.content}
                    isUser={message.isUser}
                    timestamp={message.timestamp}
                    sources={message.sources}
                  />
                )}
              </div>
            );
          })
        )}

        {waitingForResponse && (
          <ChatMessageDisplay
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

      <ActionConfirmationDialog
        action={selectedAction}
        isOpen={isConfirmDialogOpen}
        onOpenChange={setIsConfirmDialogOpen}
        onConfirm={handleExecuteAction}
        onCancel={handleCancelDialog}
      />
    </div>
  );
} 