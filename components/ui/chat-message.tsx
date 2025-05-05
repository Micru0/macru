"use client";

import { User, Bot, ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { cn } from "@/lib/utils";
import { useState } from 'react';
import { SourceChunk } from '@/lib/services/response-processor';
import { useMediaQuery } from "@/lib/hooks/use-media-query";

export interface ChatMessageProps {
  message: string;
  isUser: boolean;
  timestamp?: Date;
  sources?: SourceChunk[];
  isLoading?: boolean;
}

export function ChatMessage({
  message,
  isUser,
  timestamp,
  sources,
  isLoading = false,
}: ChatMessageProps) {
  const [showSources, setShowSources] = useState(false);
  const isMobile = useMediaQuery("(max-width: 640px)");

  return (
    <div
      className={cn(
        "flex w-full items-start gap-x-2 sm:gap-x-4 py-3 sm:py-6",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "flex shrink-0 select-none items-center justify-center rounded-full",
          isMobile ? "h-6 w-6" : "h-8 w-8", 
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? 
          <User className={isMobile ? "h-4 w-4" : "h-5 w-5"} /> : 
          <Bot className={isMobile ? "h-4 w-4" : "h-5 w-5"} />
        }
      </div>
      <div className="flex flex-col max-w-2xl w-auto">
        <div
          className={cn(
            "rounded-lg px-3 py-2 sm:px-4 sm:py-2 shadow",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          {isLoading ? (
            <div className="flex space-x-2 p-2 items-center">
              <div className="animate-pulse h-2 w-2 rounded-full bg-current" />
              <div className="animate-pulse h-2 w-2 rounded-full bg-current delay-150" />
              <div className="animate-pulse h-2 w-2 rounded-full bg-current delay-300" />
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-full text-sm sm:text-base">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]} 
                rehypePlugins={[rehypeRaw]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {children}
                    </a>
                  ),
                  ul: ({ children }) => <ul className="list-disc pl-3 sm:pl-4 mb-2">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-3 sm:pl-4 mb-2">{children}</ol>,
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                  pre: ({ children, ...props }) => (
                    <pre className="bg-muted p-1 sm:p-2 rounded-md overflow-x-auto text-xs sm:text-sm font-mono my-1 sm:my-2" {...props}>
                      {children}
                    </pre>
                  ),
                  code: ({ node, className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    if (match || (typeof children === 'string' && children.includes('\n'))) {
                      return (
                          <code className={className} {...props}>
                            {children}
                          </code>
                      );
                    } else {
                      return <code className="bg-muted px-1 py-0.5 rounded text-xs sm:text-sm font-mono" {...props}>{children}</code>;
                    }
                  }
                }}
              >
                {message}
              </ReactMarkdown>
            </div>
          )}
        </div>
        {timestamp && (
          <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
            {new Intl.DateTimeFormat("en-US", {
              hour: "numeric",
              minute: "numeric",
            }).format(timestamp)}
          </div>
        )}
        {sources && sources.length > 0 && (
          <div className="mt-1 sm:mt-2">
            <button 
              onClick={() => setShowSources(!showSources)}
              className="text-[10px] sm:text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-1"
            >
              Sources 
              {showSources ? 
                <ChevronUp size={isMobile ? 10 : 12} /> : 
                <ChevronDown size={isMobile ? 10 : 12} />
              }
            </button>
            
            {showSources && (
              <ul className="list-disc list-inside text-[10px] sm:text-xs space-y-1 pl-1 sm:pl-2">
                {sources.map((source, index) => (
                  <li key={source.documentId || index}>
                    {source.source_url ? (
                      <a
                        href={source.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        title={`${source.documentName} (${source.documentType})${source.similarity ? ' - ' + source.similarity.toFixed(2) : ''} - ${source.source_url}`}
                      >
                        {source.documentType === 'notion' ? 'Notion: ' 
                          : source.documentType === 'file_upload' ? 'File: ' 
                          : source.documentType === 'google_calendar' ? 'Calendar: ' 
                          : ''}
                        {source.documentName || 'Unknown Source'}
                        {source.similarity && (
                          <span className="text-muted-foreground/80"> ({source.similarity.toFixed(2)})</span>
                        )}
                      </a>
                    ) : (
                      <span
                        title={`${source.documentName} (${source.documentType})${source.similarity ? ' - ' + source.similarity.toFixed(2) : ''}`}
                      >
                        {source.documentType === 'notion' ? 'Notion: ' 
                          : source.documentType === 'file_upload' ? 'File: ' 
                          : source.documentType === 'google_calendar' ? 'Calendar: ' 
                          : ''}
                        {source.documentName || 'Unknown Source'}
                        {source.similarity && (
                          <span className="text-muted-foreground/80"> ({source.similarity.toFixed(2)})</span>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 