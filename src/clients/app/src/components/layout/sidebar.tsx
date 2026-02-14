import React, { useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Settings, Search, Bot, Calendar, ChevronDown } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { AppState } from "../types/app-state";

interface SidebarProps {
  state: AppState;
  activeConversationIds: Set<string>;
  onAction: (action: string, data: any) => void;
}

export function AppSidebar({ state, activeConversationIds, onAction }: SidebarProps) {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Determine current page type
  const currentPage = location.pathname.startsWith("/agent/") 
    ? "agent" 
    : location.pathname === "/settings"
    ? "settings"
    : location.pathname === "/inspector"
    ? "inspector"
    : location.pathname === "/calendar"
    ? "calendar"
    : "home";

  // Filter agents based on search
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return state.agents;
    const query = searchQuery.toLowerCase();
    return state.agents.filter((agentId) => agentId.toLowerCase().includes(query));
  }, [state.agents, searchQuery]);

  // Count conversations per agent
  const agentConversationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    state.conversations.forEach((conversation) => {
      if (conversation.agentId) {
        counts[conversation.agentId] = (counts[conversation.agentId] || 0) + 1;
      }
    });
    return counts;
  }, [state.conversations]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="relative">
          <Search 
            className="absolute h-4 w-4 text-muted-foreground pointer-events-none z-10" 
            style={{ 
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
            }} 
          />
          <SidebarInput
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        {/* Calendar */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => onAction("show-calendar", {})}
                isActive={currentPage === "calendar"}
                tooltip="Calendar"
              >
                <Calendar />
                <span>Calendar</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Agents Section */}
        <Collapsible defaultOpen={true} className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="w-full">
                Agents
                {filteredAgents.length > 0 && (
                  <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">{filteredAgents.length}</span>
                )}
                <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredAgents.length === 0 ? (
                    <SidebarMenuItem>
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        {searchQuery ? "No matching agents" : "No agents available"}
                      </div>
                    </SidebarMenuItem>
                  ) : (
                    filteredAgents.map((agentId) => {
                      const conversationCount = agentConversationCounts[agentId] || 0;
                      const isActive = currentPage === "agent" && agentId === state.currentAgentId;
                      return (
                        <SidebarMenuItem key={agentId}>
                          <SidebarMenuButton
                            onClick={() => onAction("select-agent", { agentId })}
                            isActive={isActive}
                            tooltip={agentId}
                          >
                            <Bot />
                            <span>{agentId}</span>
                            {conversationCount > 0 && (
                              <SidebarMenuBadge className="ml-auto">{conversationCount}</SidebarMenuBadge>
                            )}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        <SidebarSeparator />

        {/* Settings */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => onAction("show-settings", {})}
                isActive={currentPage === "settings"}
                tooltip="Settings"
              >
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
