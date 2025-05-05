"use client";

import { useState, useEffect, useRef } from "react";
import { QueryBox } from "./query-box";
import { ChatMessage as ChatMessageDisplay } from "./chat-message";
import { ActionStatusIndicator } from "@/components/actions/ActionStatusIndicator";
import { Button } from "./button";
import { RotateCcw, Plus, Image as ImageIcon, FileText, Check, X } from "lucide-react";
import type { ProposedActionType } from "@/lib/types/action";
import type { SourceChunk } from "@/lib/services/response-processor";
import { useToast } from "@/components/ui/use-toast";
import { v4 as uuidv4 } from 'uuid';
import Image from 'next/image';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parseISO } from 'date-fns';
import { useMediaQuery } from "@/lib/hooks/use-media-query";

export type ChatMessageType = {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  sources?: SourceChunk[];
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

// Helper function to format date/time nicely
const formatDateTime = (isoString: string | null | undefined, formatStr: string = "PPpp XXX"): string => {
  if (!isoString) return 'N/A';
  try {
    const date = parseISO(isoString);
    return format(date, formatStr);
  } catch (e) {
    console.error("Error formatting date:", e);
    return isoString;
  }
};

// Helper function to format a date range
const formatDateRange = (startIso: string | null | undefined, endIso: string | null | undefined): string => {
  if (!startIso || !endIso) return 'N/A';
  try {
    const startDate = parseISO(startIso);
    const endDate = parseISO(endIso);
    const datePart = format(startDate, 'PP');
    const startTimePart = format(startDate, 'p');
    const endTimePart = format(endDate, 'p');
    return `${datePart} - ${startTimePart} to ${endTimePart}`;
  } catch (e) {
    console.error("Error formatting date range:", e);
    return `${startIso} to ${endIso}`;
  }
};

// Helper function to get display labels for keys
const getParameterLabel = (key: string): string => {
  switch (key) {
    case 'startDateTime': return 'Start Time';
    case 'endDateTime': return 'End Time';
    case 'summary': return 'Title';
    case 'attendees': return 'Attendees';
    case 'location': return 'Location';
    // Add more cases as needed for other actions
    default: return key.charAt(0).toUpperCase() + key.slice(1); // Capitalize first letter as fallback
  }
};

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
  const isMobile = useMediaQuery("(max-width: 640px)");

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

  const handleRejectAction = (actionId: string) => {
    console.log("Action rejected:", actionId);
    if (!actionStatuses[actionId] || actionStatuses[actionId].status === 'pending') {
      setActionStatuses(prev => ({ ...prev, [actionId]: { status: 'failed', message: 'Rejected by user' } }));
      toast({ title: "Action Rejected", description: `Action ${actionId.substring(7, 15)}... was rejected.` });
    }
  };

  const handleConfirmAndExecuteAction = async (action: ProposedActionType) => {
    const actionId = action.id;
    if (!actionId || (actionStatuses[actionId] && actionStatuses[actionId].status !== 'pending')) {
      console.warn("Attempted to execute action that is not pending or has no ID:", actionId);
      return;
    }

    setActionStatuses(prev => ({ ...prev, [actionId]: { status: 'executing' } }));

    try {
      console.log(`Executing action ${actionId} with type ${action.type}`);
      const response = await fetch('/api/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: action.type,
          parameters: action.parameters,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `API Error: ${response.statusText}`);
      }

      if (result.success) {
        setActionStatuses(prev => ({ ...prev, [actionId]: { status: 'success', message: result.message } }));
        toast({ title: "Action Successful", description: result.message || `Action ${actionId.substring(7,15)}... completed.` });
      } else {
        throw new Error(result.error || 'Action execution failed.');
      }
    } catch (error) {
      console.error("Action execution failed:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setActionStatuses(prev => ({ ...prev, [actionId]: { status: 'failed', message: errorMessage } }));
      toast({ title: "Action Failed", description: errorMessage, variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-4 sm:space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Image 
              src="/macrulogo.png"
              alt="MACRU Logo" 
              width={isMobile ? 200 : 300}
              height={isMobile ? 200 : 300}
              priority 
              className="w-auto h-auto max-w-[80%]"
            />
          </div>
        ) : (
          messages.map((message) => {
            const actionWithId = message.action;
            const showActionButtons = actionWithId && (!actionStatuses[actionWithId.id!] || actionStatuses[actionWithId.id!].status === 'pending');

            return (
              <div key={message.id}>
                <ChatMessageDisplay
                  message={message.content}
                  isUser={message.isUser}
                  timestamp={message.timestamp}
                  sources={message.sources}
                />
                
                {actionWithId && (
                  <div className="mt-2 ml-2 sm:ml-10 p-3 sm:p-4 border rounded-lg bg-muted/50 text-xs sm:text-sm shadow-sm">
                    <div className="space-y-1 mb-3">
                      {(() => {
                        const startDateTime = actionWithId.parameters.startDateTime as string | undefined;
                        const endDateTime = actionWithId.parameters.endDateTime as string | undefined;
                        const otherParams = Object.entries(actionWithId.parameters)
                          .filter(([key, value]) => 
                            key !== 'startDateTime' && 
                            key !== 'endDateTime' && 
                            (value !== null && value !== undefined || key === 'attendees')
                          );

                        const elements = otherParams.map(([key, value]) => {
                          const label = getParameterLabel(key);
                          let displayValue: string;
                          
                          if (key === 'attendees' && Array.isArray(value)) {
                            displayValue = value.length > 0 ? value.join(', ') : 'None';
                          } else if (key === 'attendees' && value === null) {
                             displayValue = 'None';
                          } else {
                            displayValue = typeof value === 'string' ? value : JSON.stringify(value);
                          }
                          
                          return (
                            <div key={key} className="flex flex-wrap">
                              <strong className="w-20 sm:w-24 shrink-0">{label}:</strong> 
                              <span className="text-muted-foreground flex-1 min-w-0 break-words">{displayValue}</span>
                            </div>
                          );
                        });

                        if (startDateTime && endDateTime) {
                          elements.push(
                            <div key="dateTimeRange" className="flex flex-wrap"> 
                              <strong className="w-20 sm:w-24 shrink-0">Time:</strong> 
                              <span className="text-muted-foreground flex-1 min-w-0 break-words">{formatDateRange(startDateTime, endDateTime)}</span>
                            </div>
                          );
                        }
                        
                        return elements;
                      })()}
                    </div>
                    
                    {showActionButtons && (
                      <div className="flex gap-2">
                        <Button 
                          variant="default" 
                          size={isMobile ? "xs" : "sm"}
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleConfirmAndExecuteAction(actionWithId)}
                        >
                          <Check className="h-3 w-3 sm:h-4 sm:w-4 mr-1" /> Confirm
                        </Button>
                        <Button 
                          variant="destructive" 
                          size={isMobile ? "xs" : "sm"}
                          onClick={() => handleRejectAction(actionWithId.id!)}
                        >
                          <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                    
                    {actionStatuses[actionWithId.id!] && actionStatuses[actionWithId.id!].status !== 'pending' && (
                      <div className="mt-2">
                        <ActionStatusIndicator
                          status={actionStatuses[actionWithId.id!].status}
                          message={actionStatuses[actionWithId.id!].message}
                        />
                      </div>
                    )}
                  </div>
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

      <div className="border-t relative">
        {messages.length > 0 && onClearChat && (
          <div className="flex justify-center pt-3 pb-1 sm:pt-4 sm:mb-4">
            <Button
              variant="outline" 
              size={isMobile ? "xs" : "sm"}
              onClick={onClearChat}
              className="text-xs"
            >
              <RotateCcw className="h-3 w-3 mr-1 sm:mr-2" />
              Clear conversation
            </Button>
          </div>
        )}
        
        <QueryBox
          onSubmit={handleSubmit}
          isLoading={isLoading || waitingForResponse}
          onReset={messages.length > 0 ? onClearChat : undefined}
        />
        
        <div className="absolute bottom-1 left-2 sm:left-4 z-10">
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className="rounded-full h-7 w-7 sm:h-8 sm:w-8 bg-background border-primary shadow-sm hover:shadow transition-shadow"
              >
                <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" sideOffset={10} className="w-40 sm:w-48 p-2 rounded-md">
              <div className="flex flex-col gap-1">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-xs sm:text-sm" 
                  onClick={() => console.log("Image upload clicked")}
                >
                  <ImageIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  Image
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-xs sm:text-sm" 
                  onClick={() => console.log("File upload clicked")}
                >
                  <FileText className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  Files
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
} 