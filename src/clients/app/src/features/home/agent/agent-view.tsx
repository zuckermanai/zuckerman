import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Bot, 
  Info, 
  FileText, 
  Wrench, 
  MessageSquare, 
  Play, 
  Edit, 
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Terminal,
  Globe,
  Palette,
  Clock,
  Cpu,
  Sparkles
} from "lucide-react";
import { GatewayClient } from "../../../core/gateway/client";
import type { UseAppReturn } from "../../../hooks/use-app";

type AgentTab = "overview" | "prompts" | "tools" | "sessions";

interface AgentPrompts {
  agentId?: string;
  system?: string;
  behavior?: string;
  personality?: string;
  instructions?: string;
  fileCount?: number;
  additionalFiles?: string[];
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  terminal: <Terminal className="h-4 w-4" />,
  browser: <Globe className="h-4 w-4" />,
  canvas: <Palette className="h-4 w-4" />,
  cron: <Clock className="h-4 w-4" />,
  device: <Cpu className="h-4 w-4" />,
  tts: <Sparkles className="h-4 w-4" />,
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  terminal: "Execute terminal commands and scripts",
  browser: "Automate web browsing and interactions",
  canvas: "Perform canvas operations and image manipulation",
  cron: "Schedule and manage recurring tasks",
  device: "Access device capabilities and sensors",
  tts: "Text-to-speech synthesis",
};

interface AgentViewProps {
  agentId: string;
  state: UseAppReturn;
  gatewayClient: GatewayClient | null;
  onClose: () => void;
}

export function AgentView({ agentId, state, gatewayClient, onClose }: AgentViewProps) {
  const [activeTab, setActiveTab] = useState<AgentTab>("overview");
  const [prompts, setPrompts] = useState<AgentPrompts | null>(null);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [promptsError, setPromptsError] = useState<string | null>(null);
  const [archivedExpanded, setArchivedExpanded] = useState(false);

  const tabs = [
    { id: "overview" as AgentTab, label: "Overview", icon: <Info className="h-4 w-4" /> },
    { id: "prompts" as AgentTab, label: "Prompts", icon: <FileText className="h-4 w-4" /> },
    { id: "tools" as AgentTab, label: "Tools", icon: <Wrench className="h-4 w-4" /> },
    { id: "sessions" as AgentTab, label: "Sessions", icon: <MessageSquare className="h-4 w-4" /> },
  ];

  // Load agent prompts when prompts tab is active
  useEffect(() => {
    if (activeTab === "prompts" && gatewayClient?.isConnected() && !loadingPrompts) {
      // Always reload when switching to prompts tab to get fresh data
      loadPrompts();
    }
  }, [activeTab, gatewayClient, agentId]);

  const loadPrompts = async () => {
    if (!gatewayClient?.isConnected()) {
      setPromptsError("Not connected to gateway");
      return;
    }

    setLoadingPrompts(true);
    setPromptsError(null);

    try {
      const response = await gatewayClient.request("agent.prompts", { agentId });
      if (response.ok && response.result) {
        const result = response.result as AgentPrompts;
        console.log("[AgentView] Prompts response:", {
          agentId: result.agentId,
          hasSystem: !!result.system,
          systemLength: result.system?.length || 0,
          hasBehavior: !!result.behavior,
          hasPersonality: !!result.personality,
          hasInstructions: !!result.instructions,
          fileCount: result.fileCount,
          additionalFiles: result.additionalFiles?.length || 0,
        });
        
        // Check if we actually got any content
        const hasContent = 
          (result.system && result.system.trim() !== "") ||
          (result.behavior && result.behavior.trim() !== "") ||
          (result.personality && result.personality.trim() !== "") ||
          (result.instructions && result.instructions.trim() !== "") ||
          (result.additionalFiles && result.additionalFiles.length > 0);
        
        if (hasContent) {
          setPrompts(result);
          setPromptsError(null);
        } else {
          setPrompts(result);
          setPromptsError("Prompts loaded but appear to be empty. Check console for details.");
          console.warn("[AgentView] Prompts are empty. Full response:", result);
        }
      } else {
        setPromptsError(response.error?.message || "Failed to load prompts");
        console.error("[AgentView] Failed to load prompts:", response.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load prompts";
      setPromptsError(errorMessage);
      console.error("[AgentView] Error loading prompts:", error);
    } finally {
      setLoadingPrompts(false);
    }
  };

  // Filter sessions for this agent
  const agentSessions = state.sessions.filter((s) => s.agentId === agentId);
  const activeAgentSessions = agentSessions.filter((s) => state.activeSessionIds.has(s.id));
  const archivedAgentSessions = agentSessions.filter((s) => !state.activeSessionIds.has(s.id));

  // Common tools list (based on project structure)
  const commonTools = ["terminal", "browser", "canvas", "cron", "device", "tts"];

  const handleRunAgent = () => {
    if (state.currentAgentId !== agentId) {
      state.setCurrentAgentId(agentId);
    }
    onClose();
  };

  const handleEditConfig = () => {
    // TODO: Open agent config file in editor
    alert("Edit config feature coming soon");
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background" style={{ minHeight: 0 }}>
      <div className="max-w-4xl mx-auto w-full px-6 py-8">
          {/* Header with tabs */}
          <div className="mb-8 pb-6 border-b border-border">
            <div className="flex items-center gap-2 mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </div>

            <div className="flex items-center gap-1 mb-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                    ${activeTab === tab.id 
                      ? "bg-accent text-accent-foreground" 
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}
                  `}
                >
                  <div className="flex items-center gap-2">
                    {tab.icon}
                    {tab.label}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Bot className="h-5 w-5 text-muted-foreground" />
                  <h1 className="text-2xl font-semibold text-foreground">{agentId}</h1>
                </div>
                <p className="text-sm text-muted-foreground">
                  {activeTab === "overview" && "Agent overview and quick actions"}
                  {activeTab === "prompts" && "System prompts, behavior, and personality"}
                  {activeTab === "tools" && "Available tools and capabilities"}
                  {activeTab === "sessions" && "Active and archived sessions"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEditConfig}
                  className="h-8"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Config
                </Button>
                <Button
                  size="sm"
                  onClick={handleRunAgent}
                  className="h-8"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Run Agent
                </Button>
              </div>
            </div>
          </div>

          {/* Tab Content */}
          <div className="space-y-6">
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Stats Card */}
                <div className="border border-border rounded-md bg-card">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-foreground">Statistics</h2>
                  </div>
                  <div className="px-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Active Sessions</div>
                        <div className="text-2xl font-semibold text-foreground">
                          {activeAgentSessions.length}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Total Sessions</div>
                        <div className="text-2xl font-semibold text-foreground">
                          {agentSessions.length}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="border border-border rounded-md bg-card">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-foreground">Quick Actions</h2>
                  </div>
                  <div className="px-6 py-4 space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        state.setCurrentAgentId(agentId);
                        state.createSession("main", agentId).then(() => onClose());
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      New Session
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleRunAgent}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Start Chat
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "prompts" && (
              <div className="space-y-6">
                {loadingPrompts ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : promptsError ? (
                  <div className="border border-destructive/50 rounded-md bg-destructive/10 px-6 py-4">
                    <p className="text-sm text-destructive">{promptsError}</p>
                  </div>
                ) : prompts ? (
                  <>
                    {prompts.system && (
                      <div className="border border-border rounded-md bg-card">
                        <div className="px-6 py-4 border-b border-border">
                          <h2 className="text-base font-semibold text-foreground">System Prompt</h2>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                          <pre className="px-6 py-4 text-sm font-mono text-foreground whitespace-pre-wrap">
                            {prompts.system}
                          </pre>
                        </div>
                      </div>
                    )}

                    {prompts.behavior && (
                      <div className="border border-border rounded-md bg-card">
                        <div className="px-6 py-4 border-b border-border">
                          <h2 className="text-base font-semibold text-foreground">Behavior</h2>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                          <pre className="px-6 py-4 text-sm font-mono text-foreground whitespace-pre-wrap">
                            {prompts.behavior}
                          </pre>
                        </div>
                      </div>
                    )}

                    {prompts.personality && (
                      <div className="border border-border rounded-md bg-card">
                        <div className="px-6 py-4 border-b border-border">
                          <h2 className="text-base font-semibold text-foreground">Personality</h2>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                          <pre className="px-6 py-4 text-sm font-mono text-foreground whitespace-pre-wrap">
                            {prompts.personality}
                          </pre>
                        </div>
                      </div>
                    )}

                    {prompts.instructions && (
                      <div className="border border-border rounded-md bg-card">
                        <div className="px-6 py-4 border-b border-border">
                          <h2 className="text-base font-semibold text-foreground">Instructions</h2>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                          <pre className="px-6 py-4 text-sm font-mono text-foreground whitespace-pre-wrap">
                            {prompts.instructions}
                          </pre>
                        </div>
                      </div>
                    )}

                    {prompts.additionalFiles && prompts.additionalFiles.length > 0 && (
                      <div className="border border-border rounded-md bg-card">
                        <div className="px-6 py-4 border-b border-border">
                          <h2 className="text-base font-semibold text-foreground">Additional Prompt Files</h2>
                        </div>
                        <div className="px-6 py-4">
                          <ul className="space-y-2">
                            {prompts.additionalFiles.map((fileName, idx) => (
                              <li key={idx} className="text-sm text-foreground">
                                • {fileName}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {prompts.fileCount !== undefined && prompts.fileCount > 0 && !prompts.additionalFiles && (
                      <div className="text-sm text-muted-foreground">
                        {prompts.fileCount} additional prompt file{prompts.fileCount !== 1 ? "s" : ""}
                      </div>
                    )}

                    {(!prompts.system || prompts.system.trim() === "") && 
                     (!prompts.behavior || prompts.behavior.trim() === "") && 
                     (!prompts.personality || prompts.personality.trim() === "") && 
                     (!prompts.instructions || prompts.instructions.trim() === "") && 
                     (!prompts.additionalFiles || prompts.additionalFiles.length === 0) && (
                      <div className="text-center py-12 text-muted-foreground">
                        No prompts available for this agent
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    Click to load prompts
                  </div>
                )}
              </div>
            )}

            {activeTab === "tools" && (
              <div className="border border-border rounded-md bg-card">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-base font-semibold text-foreground">Available Tools</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tools available to this agent
                  </p>
                </div>
                <div className="px-6 py-4">
                  <div className="grid grid-cols-1 gap-3">
                    {commonTools.map((tool) => (
                      <div
                        key={tool}
                        className="flex items-center gap-3 p-3 rounded-md border border-border bg-background hover:bg-accent/50 transition-colors"
                      >
                        <div className="text-muted-foreground">
                          {TOOL_ICONS[tool] || <Wrench className="h-4 w-4" />}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-foreground capitalize">{tool}</div>
                          <div className="text-sm text-muted-foreground">
                            {TOOL_DESCRIPTIONS[tool] || "Tool description"}
                          </div>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          Enabled
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "sessions" && (
              <div className="space-y-6">
                {/* Active Sessions */}
                {activeAgentSessions.length > 0 && (
                  <div className="border border-border rounded-md bg-card">
                    <div className="px-6 py-4 border-b border-border">
                      <h2 className="text-base font-semibold text-foreground">Active Sessions</h2>
                      <Badge variant="secondary" className="ml-2">
                        {activeAgentSessions.length}
                      </Badge>
                    </div>
                    <div className="px-6 py-4 space-y-1">
                      {activeAgentSessions.map((session) => (
                        <div key={session.id} className="py-2">
                          <button
                            onClick={() => {
                              state.setCurrentSessionId(session.id);
                              state.addToActiveSessions(session.id);
                              onClose();
                            }}
                            className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium text-foreground">
                                {session.label || session.id}
                              </span>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Archived Sessions */}
                {archivedAgentSessions.length > 0 && (
                  <div className="border border-border rounded-md bg-card">
                    <button
                      onClick={() => setArchivedExpanded(!archivedExpanded)}
                      className="w-full px-6 py-4 border-b border-border flex items-center justify-between hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {archivedExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <h2 className="text-base font-semibold text-foreground">Archived Sessions</h2>
                        <Badge variant="secondary">
                          {archivedAgentSessions.length}
                        </Badge>
                      </div>
                    </button>
                    {archivedExpanded && (
                      <div className="px-6 py-4 space-y-1">
                        {archivedAgentSessions.map((session) => (
                          <div key={session.id} className="py-2">
                            <button
                              onClick={() => {
                                state.setCurrentSessionId(session.id);
                                state.addToActiveSessions(session.id);
                                onClose();
                              }}
                              className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors opacity-70"
                            >
                              <div className="flex items-center gap-2">
                                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-foreground">
                                  {session.label || session.id}
                                </span>
                              </div>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {agentSessions.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    No sessions for this agent yet
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
  );
}
