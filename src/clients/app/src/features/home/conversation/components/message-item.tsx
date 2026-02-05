import React from "react";
import { Bot, User, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { JsonViewer } from "@/components/json-viewer";
import { StepProgress } from "./step-progress";
import type { Message } from "../../../../types/message";

interface MessageItemProps {
  message: Message;
  agentId: string | null;
  isSending: boolean;
}

export function MessageItem({ message, agentId, isSending }: MessageItemProps) {
  return (
    <div
      key={`${message.role}-${message.timestamp}`}
      className="flex gap-4 py-4 border-b border-border last:border-b-0 transition-opacity duration-200 animate-in fade-in"
      style={{ borderColor: 'hsl(var(--border))' }}
    >
      <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: 'hsl(var(--muted))' }}>
        {message.role === "assistant" ? (
          <Bot className="h-5 w-5 text-muted-foreground" />
        ) : message.role === "user" ? (
          <User className="h-5 w-5 text-muted-foreground" />
        ) : (
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold text-foreground">
            {message.role === "user"
              ? "You"
              : message.role === "assistant"
              ? agentId || "Assistant"
              : "System"}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {message.isStreaming && (
            <span className="text-xs text-muted-foreground/60 italic">typing...</span>
          )}
        </div>
        <div className="text-sm text-foreground leading-relaxed break-words" style={{ color: 'hsl(var(--foreground))' }}>
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              code: ({ children, className }) => {
                const isInline = !className;
                return isInline ? (
                  <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-xs font-mono">{children}</code>
                ) : (
                  <code className="block p-3 rounded-md bg-muted text-foreground text-xs font-mono overflow-x-auto">{children}</code>
                );
              },
              pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
              ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
              li: ({ children }) => <li className="ml-4">{children}</li>,
              blockquote: ({ children }) => <blockquote className="border-l-4 border-border pl-4 italic my-2">{children}</blockquote>,
              h1: ({ children }) => <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0">{children}</h1>,
              h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h2>,
              h3: ({ children }) => <h3 className="text-base font-bold mb-2 mt-4 first:mt-0">{children}</h3>,
              a: ({ children, href, node, ...props }) => {
                if (!href) {
                  return <span className="text-primary underline">{children}</span>;
                }
                const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (href) {
                    // Use Electron API if available, otherwise fallback to window.open
                    if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
                      try {
                        await (window as any).electronAPI.openExternal(href);
                      } catch (error) {
                        console.error('Failed to open external URL:', error);
                        // Fallback to window.open if Electron API fails
                        window.open(href, '_blank', 'noopener,noreferrer');
                      }
                    } else {
                      // Fallback for web environment
                      window.open(href, '_blank', 'noopener,noreferrer');
                    }
                  }
                };
                return (
                  <a 
                    {...props}
                    href={href} 
                    className="text-primary underline hover:text-primary/80 cursor-pointer" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={handleClick}
                    style={{ pointerEvents: 'auto', position: 'relative', zIndex: 10 }}
                  >
                    {children}
                </a>
                );
              },
            }}
          >
            {message.content || (message.role === "assistant" && isSending ? "..." : "")}
          </ReactMarkdown>
        </div>
        
        {/* Step progress display */}
        {message.steps && message.steps.length > 0 && (
          <StepProgress
            steps={message.steps}
            currentStep={message.currentStep}
            progress={message.stepProgress}
            confirmationRequired={message.confirmationRequired}
            fallbackTask={message.fallbackTask}
          />
        )}
        
        {message.toolCalls && message.toolCalls.length > 0 ? (
          <div className="mt-3">
            <JsonViewer 
              data={message.toolCalls.map(tc => {
                let parsedArgs: unknown;
                try {
                  parsedArgs = JSON.parse(tc.arguments);
                } catch {
                  parsedArgs = tc.arguments;
                }
                return {
                  id: tc.id,
                  name: tc.name,
                  arguments: parsedArgs,
                };
              })} 
              title="Tools Used" 
            />
          </div>
        ) : null}
        
        {message.rawResponse ? (
          <div className="mt-3">
            <JsonViewer data={message.rawResponse} title="Raw JSON Response" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
