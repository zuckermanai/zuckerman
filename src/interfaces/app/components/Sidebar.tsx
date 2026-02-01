import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, MessageSquare, Users, Hash, Settings, Code, ChevronDown, ChevronRight, Search, Bot } from "lucide-react";
import type { AppState } from "./App";

interface SidebarProps {
  state: AppState;
  onAction: (action: string, data: any) => void;
}

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultExpanded?: boolean;
  storageKey: string;
  children: React.ReactNode;
}

function CollapsibleSection({ title, count, defaultExpanded = true, storageKey, children }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem(`sidebar:collapsed:${storageKey}`);
    return stored ? stored === "false" : defaultExpanded;
  });

  const toggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    localStorage.setItem(`sidebar:collapsed:${storageKey}`, String(newState));
  };

  return (
    <div>
      <button
        onClick={toggle}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-accent/30 transition-colors rounded-md group"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            {title}
          </h3>
          {count !== undefined && count > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
              {count}
            </Badge>
          )}
        </div>
      </button>
      {isExpanded && (
        <div className="mt-1">
          {children}
        </div>
      )}
    </div>
  );
}

function SessionItem({ session, isActive, onSelect }: { session: AppState["sessions"][0]; isActive: boolean; onSelect: () => void }) {
  const getIcon = () => {
    switch (session.type) {
      case "main":
        return <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />;
      case "group":
        return <Users className="h-4 w-4 shrink-0 text-muted-foreground" />;
      case "channel":
        return <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />;
      default:
        return <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />;
    }
  };

  return (
    <button
      onClick={onSelect}
      className={`
        w-full px-3 py-1.5 rounded-md text-sm text-left
        transition-colors duration-150
        flex items-center gap-2 group
        ${
          isActive
            ? "bg-accent text-foreground font-medium"
            : "text-foreground/80 hover:bg-accent/50 hover:text-foreground"
        }
      `}
    >
      {getIcon()}
      <span className="truncate flex-1">{session.label || session.id}</span>
    </button>
  );
}

export function Sidebar({ state, onAction }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter sessions based on search
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return state.sessions;
    const query = searchQuery.toLowerCase();
    return state.sessions.filter(
      (session) =>
        session.label?.toLowerCase().includes(query) ||
        session.id.toLowerCase().includes(query)
    );
  }, [state.sessions, searchQuery]);

  // Group sessions into Active and Archived
  const activeSession = useMemo(() => {
    return state.sessions.find((s) => s.id === state.currentSessionId);
  }, [state.sessions, state.currentSessionId]);

  const archivedSessions = useMemo(() => {
    const activeId = state.currentSessionId;
    return filteredSessions.filter((s) => s.id !== activeId);
  }, [filteredSessions, state.currentSessionId]);

  // Count sessions per agent
  const agentSessionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    state.sessions.forEach((session) => {
      if (session.agentId) {
        counts[session.agentId] = (counts[session.agentId] || 0) + 1;
      }
    });
    return counts;
  }, [state.sessions]);

  // Filter agents based on search
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return state.agents;
    const query = searchQuery.toLowerCase();
    return state.agents.filter((agentId) => agentId.toLowerCase().includes(query));
  }, [state.agents, searchQuery]);

  return (
    <div 
      className="w-[240px] bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden shrink-0"
    >
      {/* Quick Actions Bar */}
      <div className="p-2 border-b border-sidebar-border space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-7 text-sm bg-background"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-7 text-xs font-normal"
          onClick={() => onAction("new-session", {})}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New session
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2 space-y-1">
          {/* Active Session */}
          {activeSession ? (
            <CollapsibleSection
              title="Active Session"
              defaultExpanded={true}
              storageKey="active-session"
            >
              <div className="px-3 space-y-0.5">
                <SessionItem
                  session={activeSession}
                  isActive={true}
                  onSelect={() => onAction("select-session", { sessionId: activeSession.id })}
                />
              </div>
            </CollapsibleSection>
          ) : (
            state.sessions.length === 0 && !searchQuery && (
              <div className="px-3 py-4 text-center">
                <div className="text-xs text-muted-foreground/70 mb-2">No sessions yet</div>
              </div>
            )
          )}

          {/* Archived Sessions */}
          <CollapsibleSection
            title="Archived"
            count={archivedSessions.length}
            defaultExpanded={true}
            storageKey="archived-sessions"
          >
            <div className="px-3 space-y-0.5">
              {archivedSessions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground/70">
                  {searchQuery ? "No matching sessions" : "No archived sessions"}
                </div>
              ) : (
                archivedSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={false}
                    onSelect={() => onAction("select-session", { sessionId: session.id })}
                  />
                ))
              )}
            </div>
          </CollapsibleSection>

          <Separator className="my-2" />

          {/* Agents Section */}
          <CollapsibleSection
            title="Agents"
            count={filteredAgents.length}
            defaultExpanded={true}
            storageKey="agents"
          >
            <div className="px-3 space-y-0.5">
              {filteredAgents.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground/70">
                  {searchQuery ? "No matching agents" : "No agents available"}
                </div>
              ) : (
                filteredAgents.map((agentId) => {
                  const sessionCount = agentSessionCounts[agentId] || 0;
                  return (
                    <button
                      key={agentId}
                      onClick={() => onAction("select-agent", { agentId })}
                      className={`
                        w-full px-3 py-1.5 rounded-md text-sm text-left
                        transition-colors duration-150
                        flex items-center gap-2 group
                        ${
                          agentId === state.currentAgentId
                            ? "bg-accent text-foreground font-medium"
                            : "text-foreground/80 hover:bg-accent/50 hover:text-foreground"
                        }
                      `}
                    >
                      <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1">{agentId}</span>
                      {sessionCount > 0 && (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
                          {sessionCount}
                        </Badge>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </CollapsibleSection>

          <Separator className="my-2" />

          {/* Settings Section */}
          <div className="px-3 space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs font-normal text-muted-foreground hover:text-foreground hover:bg-accent/50 justify-start"
              onClick={() => onAction("show-settings", {})}
            >
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Settings
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs font-normal text-muted-foreground hover:text-foreground hover:bg-accent/50 justify-start"
              onClick={() => onAction("restart-onboarding", {})}
            >
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Setup
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
