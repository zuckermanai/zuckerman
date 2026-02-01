import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, MessageSquare, Users, Hash, Settings, Code, ChevronDown, ChevronRight, Search, Bot, RotateCcw, Archive } from "lucide-react";
import type { AppState } from "../infrastructure/types/app-state";

interface SidebarProps {
  state: AppState;
  activeSessionIds: Set<string>;
  onAction: (action: string, data: any) => void;
}

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultExpanded?: boolean;
  storageKey: string;
  alwaysExpanded?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, count, defaultExpanded = true, storageKey, alwaysExpanded = false, children }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (alwaysExpanded) return true;
    const stored = localStorage.getItem(`sidebar:collapsed:${storageKey}`);
    return stored ? stored === "false" : defaultExpanded;
  });

  const toggle = () => {
    if (alwaysExpanded) return;
    const newState = !isExpanded;
    setIsExpanded(newState);
    localStorage.setItem(`sidebar:collapsed:${storageKey}`, String(newState));
  };

  // Force expanded state if alwaysExpanded is true
  const expanded = alwaysExpanded ? true : isExpanded;

  return (
    <div>
      <button
        onClick={toggle}
        className={`w-full px-3 py-1.5 flex items-center justify-between transition-colors rounded-md group ${
          alwaysExpanded ? 'cursor-default' : 'hover:bg-accent/50'
        }`}
        style={{ backgroundColor: 'transparent' }}
        disabled={alwaysExpanded}
      >
        <div className="flex items-center gap-1.5">
          {!alwaysExpanded && (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
            )
          )}
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {title}
          </h3>
          {count !== undefined && count > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal bg-muted/50 text-muted-foreground border-0">
              {count}
            </Badge>
          )}
        </div>
      </button>
      {expanded && (
        <div className="mt-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

function SessionItem({ 
  session, 
  isActive, 
  onSelect, 
  onRestore,
  onArchive
}: { 
  session: AppState["sessions"][0]; 
  isActive: boolean; 
  onSelect: () => void;
  onRestore?: () => void;
  onArchive?: () => void;
}) {
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
    <div className="group/item relative">
      <button
        onClick={onSelect}
        className={`
          w-full px-3 py-1.5 text-sm text-left
          transition-all duration-150
          flex items-center gap-2 group relative
          ${
            isActive
              ? "text-foreground font-medium"
              : "text-foreground/70 hover:text-foreground"
          }
        `}
        style={{
          backgroundColor: isActive ? 'hsl(var(--accent))' : 'transparent',
          borderRadius: '6px',
        }}
      >
        {/* GitHub-style left border indicator for active item */}
        {isActive && (
          <div 
            className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r"
            style={{ backgroundColor: 'hsl(var(--primary))' }}
          />
        )}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {getIcon()}
          <span className="truncate flex-1">{session.label || session.id}</span>
        </div>
        {/* Subtle hover background */}
        <div 
          className={`absolute inset-0 rounded-md transition-opacity duration-150 ${
            isActive ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{ backgroundColor: 'hsl(var(--accent))', zIndex: -1 }}
        />
      </button>
      {/* Action buttons */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center gap-1">
        {onRestore && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRestore();
            }}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Restore"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        {onArchive && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArchive();
            }}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Archive"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function Sidebar({ state, activeSessionIds, onAction }: SidebarProps) {
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
  const activeSessions = useMemo(() => {
    return filteredSessions.filter((s) => activeSessionIds.has(s.id));
  }, [filteredSessions, activeSessionIds]);

  const archivedSessions = useMemo(() => {
    return filteredSessions.filter((s) => !activeSessionIds.has(s.id));
  }, [filteredSessions, activeSessionIds]);

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
      className="w-full bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden"
      style={{ backgroundColor: 'hsl(var(--sidebar-background))' }}
    >
      {/* Quick Actions Bar - GitHub style */}
      <div className="p-4 border-b border-sidebar-border space-y-3">
        <div className="relative">
          <Search 
            className="absolute h-4 w-4 text-muted-foreground pointer-events-none z-10" 
            style={{ 
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              lineHeight: '1'
            }} 
          />
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pr-3 text-[13px] bg-background border-border focus-visible:border-primary transition-colors w-full"
            style={{ paddingLeft: '36px' }}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-8 text-[13px] font-normal justify-start px-3 hover:bg-accent/50 transition-colors"
          onClick={() => onAction("new-session", {})}
        >
          <Plus className="h-4 w-4 mr-2" />
          New session
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2 px-1 space-y-1">
          {/* Active Sessions */}
          <CollapsibleSection
            title="Active Sessions"
            count={activeSessions.length}
            defaultExpanded={true}
            storageKey="active-sessions"
            alwaysExpanded={activeSessions.length > 0}
          >
            <div className="px-2 space-y-0.5">
              {activeSessions.length === 0 ? (
                state.sessions.length === 0 && !searchQuery ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground/70">
                    No sessions yet
                  </div>
                ) : (
                  <div className="px-3 py-2 text-xs text-muted-foreground/70">
                    {searchQuery ? "No matching active sessions" : "No active sessions"}
                  </div>
                )
              ) : (
                activeSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={session.id === state.currentSessionId}
                    onSelect={() => onAction("select-session", { sessionId: session.id })}
                    onArchive={() => onAction("archive-session", { sessionId: session.id })}
                  />
                ))
              )}
            </div>
          </CollapsibleSection>

          {/* Archived Sessions */}
          <CollapsibleSection
            title="Archived"
            count={archivedSessions.length}
            defaultExpanded={false}
            storageKey="archived-sessions"
          >
            <div className="px-2 space-y-0.5">
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
                    onSelect={() => {
                      // Don't immediately select archived sessions - require restore button
                    }}
                    onRestore={() => onAction("restore-session", { sessionId: session.id })}
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
            <div className="px-2 space-y-0.5">
              {filteredAgents.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground/70">
                  {searchQuery ? "No matching agents" : "No agents available"}
                </div>
              ) : (
                filteredAgents.map((agentId) => {
                  const sessionCount = agentSessionCounts[agentId] || 0;
                  const isActive = agentId === state.currentAgentId;
                  return (
                    <button
                      key={agentId}
                      onClick={() => onAction("select-agent", { agentId })}
                      className={`
                        w-full px-3 py-1.5 text-sm text-left
                        transition-all duration-150
                        flex items-center gap-2 group relative
                        ${
                          isActive
                            ? "text-foreground font-medium"
                            : "text-foreground/70 hover:text-foreground"
                        }
                      `}
                      style={{
                        backgroundColor: isActive ? 'hsl(var(--accent))' : 'transparent',
                        borderRadius: '6px',
                      }}
                    >
                      {/* GitHub-style left border indicator for active item */}
                      {isActive && (
                        <div 
                          className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r"
                          style={{ backgroundColor: 'hsl(var(--primary))' }}
                        />
                      )}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate flex-1">{agentId}</span>
                        {sessionCount > 0 && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal bg-muted/50 text-muted-foreground border-0 shrink-0">
                            {sessionCount}
                          </Badge>
                        )}
                      </div>
                      {/* Subtle hover background */}
                      <div 
                        className={`absolute inset-0 rounded-md transition-opacity duration-150 ${
                          isActive ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        style={{ backgroundColor: 'hsl(var(--accent))', zIndex: -1 }}
                      />
                    </button>
                  );
                })
              )}
            </div>
          </CollapsibleSection>

          <Separator className="my-2" />

          {/* Settings Section - GitHub style */}
          <div className="px-3 space-y-0.5 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-sm font-normal text-foreground/70 hover:text-foreground hover:bg-accent/50 justify-start px-3 transition-colors"
              onClick={() => onAction("show-settings", {})}
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-sm font-normal text-foreground/70 hover:text-foreground hover:bg-accent/50 justify-start px-3 transition-colors"
              onClick={() => onAction("restart-onboarding", {})}
            >
              <Code className="h-4 w-4 mr-2" />
              Setup
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
