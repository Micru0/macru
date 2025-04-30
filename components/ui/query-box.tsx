"use client";

import { useState, useRef, useEffect } from "react";
import { SendIcon, RefreshCcw } from "lucide-react";
import { Button } from "./button";
import { Textarea } from "./textarea";

export interface QueryBoxProps {
  onSubmit: (query: string) => void;
  isLoading: boolean;
  onReset?: () => void;
  placeholder?: string;
  initialValue?: string;
  disabled?: boolean;
}

export function QueryBox({
  onSubmit,
  isLoading,
  onReset,
  placeholder = "Ask Macru anything...",
  initialValue = "",
  disabled = false,
}: QueryBoxProps) {
  const [query, setQuery] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize the textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to get the correct scrollHeight
      textareaRef.current.style.height = 'auto';
      
      // Set the height based on scrollHeight with a maximum height
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 200; // Maximum height in pixels
      
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading || disabled) return;
    
    onSubmit(query.trim());
    // Keep the query text in place until a response is received
    setQuery("");
    
    // Focus back to textarea after submission
    if (textareaRef.current) {
      textareaRef.current.focus();
      // Reset height after submission
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Enter (without Shift key for new line)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
    }
  };

  return (
    <div className="w-full p-2 pb-12 pt-3">
      <form onSubmit={handleSubmit} className="relative">
        <Textarea
          ref={textareaRef}
          value={query}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[60px] w-full border rounded-lg focus:ring-2 focus:ring-offset-2 focus:ring-offset-background pl-4 pr-14 py-3 overflow-y-auto"
          disabled={isLoading || disabled}
          rows={1}
          style={{ 
            resize: "none",
            overflowY: query.split('\n').length > 3 ? 'auto' : 'hidden'
          }}
        />

        <div className="absolute right-2 bottom-2 flex space-x-1">
          {onReset && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleReset}
              disabled={isLoading || disabled}
              title="Clear conversation"
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="submit"
            variant="default"
            size="icon"
            className="h-8 w-8 rounded-full bg-primary hover:bg-primary/90"
            disabled={!query.trim() || isLoading || disabled}
            title="Send message"
          >
            <SendIcon className="h-4 w-4 text-primary-foreground" />
          </Button>
        </div>
      </form>
    </div>
  );
} 