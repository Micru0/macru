"use client";

import { User, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { cn } from "@/lib/utils";

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
                  // @ts-ignore - inline is provided by react-markdown
                  code: ({ node, inline, className, children, ...props }) => {
                    if (inline) {
                      return <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>;
                    }
                    // For block code, wrap the code in a div instead of pre to avoid nesting issue
                    // Apply styling similar to pre for consistency
                    const match = /language-(\w+)/.exec(className || '');
                    return (
                      <div className="bg-muted p-2 rounded-md overflow-x-auto text-sm font-mono my-2">
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </div>
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
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Sources:
            </p>
            <div className="flex flex-col space-y-1">
              {sources.map((source, index) => (
                <div
                  key={index}
                  className="text-xs rounded bg-background p-2 border max-w-xs"
                >
                  <div className="font-medium">{source.title}</div>
                  {source.content && (
                    <div className="text-muted-foreground mt-1 line-clamp-2">
                      {source.content}
                    </div>
                  )}
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline mt-1 block truncate"
                    >
                      {source.url}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 