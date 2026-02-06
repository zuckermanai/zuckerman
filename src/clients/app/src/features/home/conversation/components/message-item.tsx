import React from "react";
import { Bot, User, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { JsonViewer } from "@/components/json-viewer";
import { ToolCallsViewer } from "@/components/tool-calls-viewer";
import type { Message } from "../../../../types/message";

interface MessageItemProps {
  message: Message;
  agentId: string | null;
  isSending: boolean;
  toolResults?: Array<{ toolCallId: string; content: string }>;
}

export function MessageItem({ message, agentId, isSending, toolResults = [] }: MessageItemProps) {
  // Don't render tool/system result messages - they're integrated into tool calls
  const isSystemToolResult = message.role === "system" && 
    message.content.trim().startsWith("{") && 
    message.content.trim().endsWith("}");
  
  if (message.role === "tool" || isSystemToolResult) {
    return null;
  }

  const hasContent = message.content && message.content.trim().length > 0;
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
  const showHeader = hasContent || message.rawResponse;

  return (
    <div
      key={`${message.role}-${message.timestamp}`}
      className={`transition-opacity duration-200 animate-in fade-in ${showHeader ? 'py-4 border-b border-border last:border-b-0' : ''}`}
      style={showHeader ? { borderColor: 'hsl(var(--border))' } : {}}
    >
      {showHeader ? (
        <div className="flex gap-4">
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
            {hasContent && (
              <div className="text-sm text-foreground leading-relaxed break-words" style={{ color: 'hsl(var(--foreground))' }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
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
                    table: ({ children }) => (
                      <div className="my-4 overflow-x-auto">
                        <table className="min-w-full border-collapse border border-border">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-muted">{children}</thead>
                    ),
                    tbody: ({ children }) => (
                      <tbody>{children}</tbody>
                    ),
                    tr: ({ children }) => (
                      <tr className="border-b border-border">{children}</tr>
                    ),
                    th: ({ children }) => (
                      <th className="border border-border px-4 py-2 text-left font-semibold text-foreground">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="border border-border px-4 py-2 text-foreground">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {message.content || (message.role === "assistant" && isSending ? "..." : "")}
                </ReactMarkdown>
              </div>
            )}
            
            {hasToolCalls && (
              <ToolCallsViewer
                toolCalls={message.toolCalls.map(tc => {
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
                toolResults={toolResults}
              />
            )}
            
            {message.rawResponse ? (
              <div className="mt-3">
                <JsonViewer data={message.rawResponse} title="Raw JSON Response" />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          {hasToolCalls && (
            <ToolCallsViewer
              toolCalls={message.toolCalls.map(tc => {
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
              toolResults={toolResults}
            />
          )}
        </div>
      )}
    </div>
  );
}
