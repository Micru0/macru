"use client";

import { User, Bot, ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { cn } from "@/lib/utils";
import { useState } from 'react';

type Source = {
  title: string;
  content?: string;
  url?: string;
};

export interface ChatMessageProps {
  message: string;
  isUser: boolean;
  timestamp?: Date;
  sources?: Source[];
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

  return (
    <div
      className={cn(
        "flex w-full items-start gap-x-4 py-6",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </div>
      <div className="flex flex-col max-w-2xl w-auto">
        <div
          className={cn(
            "rounded-lg px-4 py-2 shadow",
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
            <div className="prose prose-sm dark:prose-invert">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]} 
                rehypePlugins={[rehypeRaw]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {children}
                    </a>
                  ),
                  ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                  // Handle code blocks: apply styling to pre for blocks, code for inline
                  pre: ({ children, ...props }) => (
                    <pre className="bg-muted p-2 rounded-md overflow-x-auto text-sm font-mono my-2" {...props}>
                      {children}
                    </pre>
                  ),
                  // @ts-ignore - inline is provided by react-markdown
                  code: ({ node, inline, className, children, ...props }) => {
                    if (inline) {
                      // Style inline code differently
                      return <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>;
                    }
                    // For code within pre (block code), don't add extra styling here, 
                    // rely on the parent pre handler above.
                    // Pass className for syntax highlighting if applicable.
                    const match = /language-(\w+)/.exec(className || '');
                    return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                    );
                  }
                }}
              >
                {message}
              </ReactMarkdown>
            </div>
          )}
        </div>
        {timestamp && (
          <div className="text-xs text-muted-foreground mt-1">
            {new Intl.DateTimeFormat("en-US", {
              hour: "numeric",
              minute: "numeric",
            }).format(timestamp)}
          </div>
        )}
        {sources && sources.length > 0 && (
          <div className="mt-2">
            <button 
              onClick={() => setShowSources(!showSources)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-1"
            >
              Sources 
              {showSources ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            
            {showSources && (
              <ul className="list-disc list-inside text-xs space-y-1 pl-2">
                {sources.map((source, index) => (
                  <li key={index}>
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {source.title}
                      </a>
                    ) : (
                      <span>{source.title}</span>
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