import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
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
  Sparkles,
  Activity,
  Calendar,
  Filter,
  CheckCircle2,
  XCircle,
  Circle,
  Send,
  Inbox,
  Zap,
  Code
} from "lucide-react";
import { GatewayClient } from "../../../core/gateway/client";
import type { UseAppReturn } from "../../../hooks/use-app";

type AgentTab = "overview" | "prompts" | "tools" | "conversations" | "activities";

interface AgentPrompts {
  agentId?: string;
  files?: Record<string, string>;
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  terminal: <Terminal className="h-4 w-4" />,
  browser: <Globe className="h-4 w-4" />,
  canvas: <Palette className="h-4 w-4" />,
  cron: <Clock className="h-4 w-4" />,
  tts: <Sparkles className="h-4 w-4" />,
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  terminal: "Execute terminal commands and scripts",
  browser: "Automate web browsing and interactions",
  canvas: "Perform canvas operations and image manipulation",
  cron: "Schedule and manage recurring tasks",
  tts: "Text-to-speech synthesis",
};

interface AgentViewProps {
  agentId: string;
  state: UseAppReturn;
  gatewayClient: GatewayClient | null;
  onClose: () => void;
}

interface ActivityItem {
  id: string;
  type: string;
  timestamp: number;
  agentId?: string;
  conversationId?: string;
  runId?: string;
  metadata: Record<string, unknown>;
}

export function AgentView({ agentId, state, gatewayClient, onClose }: AgentViewProps) {
  const [activeTab, setActiveTab] = useState<AgentTab>("overview");
  const [prompts, setPrompts] = useState<AgentPrompts | null>(null);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [promptsError, setPromptsError] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);
  const [activityDateFilter, setActivityDateFilter] = useState<string>("today");
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>("");

  const tabs = [
    { id: "overview" as AgentTab, label: "Overview", icon: <Info className="h-4 w-4" /> },
    { id: "prompts" as AgentTab, label: "Prompts", icon: <FileText className="h-4 w-4" /> },
    { id: "tools" as AgentTab, label: "Tools", icon: <Wrench className="h-4 w-4" /> },
    { id: "conversations" as AgentTab, label: "Conversations", icon: <MessageSquare className="h-4 w-4" /> },
    { id: "activities" as AgentTab, label: "Activities", icon: <Activity className="h-4 w-4" /> },
  ];

  // Load agent prompts when prompts tab is active
  useEffect(() => {
    if (activeTab === "prompts" && gatewayClient?.isConnected() && !loadingPrompts) {
      // Always reload when switching to prompts tab to get fresh data
      loadPrompts();
    }
  }, [activeTab, gatewayClient, agentId]);

  // Load activities when activities tab is active
  useEffect(() => {
    if (activeTab === "activities" && gatewayClient?.isConnected() && !loadingActivities) {
      loadActivities();
    }
  }, [activeTab, gatewayClient, agentId, activityDateFilter, activityTypeFilter]);

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
        setPrompts(result);
        setPromptsError(null);
        // Initialize edited content with current content
        if (result.files) {
          setEditedContent({ ...result.files });
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

  const savePromptFile = async (fileName: string) => {
    if (!gatewayClient?.isConnected()) {
      setPromptsError("Not connected to gateway");
      return;
    }

    const content = editedContent[fileName];
    if (content === undefined) {
      return;
    }

    setSaving(true);
    try {
      const response = await gatewayClient.request("agent.savePrompt", {
        agentId,
        fileName,
        content,
      });

      if (response.ok) {
        // Reload prompts to get fresh data
        await loadPrompts();
        setEditingFile(null);
      } else {
        setPromptsError(response.error?.message || "Failed to save file");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to save file";
      setPromptsError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const loadActivities = async () => {
    if (!gatewayClient?.isConnected()) {
      setActivitiesError("Not connected to gateway");
      return;
    }

    setLoadingActivities(true);
    setActivitiesError(null);

    try {
      // Parse date filter - convert relative periods to timestamps
      let from: number | undefined;
      const to = Date.now();
      
      switch (activityDateFilter) {
        case "today":
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          from = todayStart.getTime();
          break;
        case "last7":
          from = to - 7 * 24 * 60 * 60 * 1000;
          break;
        case "last30":
          from = to - 30 * 24 * 60 * 60 * 1000;
          break;
        case "last90":
          from = to - 90 * 24 * 60 * 60 * 1000;
          break;
        default:
          // Default to today
          const defaultTodayStart = new Date();
          defaultTodayStart.setHours(0, 0, 0, 0);
          from = defaultTodayStart.getTime();
      }

      const params: Record<string, unknown> = {
        agentId,
        from,
        to,
        limit: 100,
      };

      if (activityTypeFilter) {
        params.type = activityTypeFilter;
      }

      const response = await gatewayClient.request("activities.list", params);
      if (response.ok && response.result) {
        const result = response.result as { activities?: ActivityItem[]; count?: number };
        const activities = result.activities || [];
        setActivities(activities);
        setActivitiesError(null);
      } else {
        const errorMsg = response.error?.message || "Failed to load activities";
        setActivitiesError(errorMsg);
        console.error("[AgentView] Failed to load activities:", response.error);
        setActivities([]);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load activities";
      setActivitiesError(errorMessage);
      console.error("[AgentView] Error loading activities:", error);
    } finally {
      setLoadingActivities(false);
    }
  };

  const formatActivityType = (type: string): string => {
    const typeMap: Record<string, string> = {
      "agent.run": "Started agent run",
      "agent.run.complete": "Completed agent run",
      "agent.run.error": "Agent run failed",
      "tool.call": "Called tool",
      "tool.result": "Tool completed",
      "conversation.create": "Created conversation",
      "conversation.update": "Updated conversation",
      "channel.message.incoming": "Received message",
      "channel.message.outgoing": "Sent message",
      "calendar.event.triggered": "Triggered calendar event",
      "calendar.event.created": "Created calendar event",
      "calendar.event.updated": "Updated calendar event",
      "calendar.event.deleted": "Deleted calendar event",
    };
    return typeMap[type] || type.split(".").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  };

  const getActivityIcon = (type: string) => {
    if (type === "agent.run") return <Play className="h-4 w-4" />;
    if (type === "agent.run.complete") return <CheckCircle2 className="h-4 w-4" />;
    if (type === "agent.run.error") return <XCircle className="h-4 w-4" />;
    if (type.startsWith("tool.call")) return <Terminal className="h-4 w-4" />;
    if (type.startsWith("tool.result")) return <CheckCircle2 className="h-4 w-4" />;
    if (type === "conversation.create") return <Circle className="h-4 w-4" />;
    if (type === "conversation.update") return <Circle className="h-4 w-4" />;
    if (type === "channel.message.incoming") return <Inbox className="h-4 w-4" />;
    if (type === "channel.message.outgoing") return <Send className="h-4 w-4" />;
    if (type.startsWith("calendar.")) return <Calendar className="h-4 w-4" />;
    return <Activity className="h-4 w-4" />;
  };

  const getActivityColor = (type: string): string => {
    if (type === "agent.run.complete") return "text-green-600 dark:text-green-400";
    if (type === "agent.run.error") return "text-red-600 dark:text-red-400";
    if (type === "agent.run") return "text-blue-600 dark:text-blue-400";
    if (type.startsWith("tool.")) return "text-purple-600 dark:text-purple-400";
    if (type.startsWith("conversation.")) return "text-orange-600 dark:text-orange-400";
    if (type.startsWith("channel.")) return "text-cyan-600 dark:text-cyan-400";
    if (type.startsWith("calendar.")) return "text-pink-600 dark:text-pink-400";
    return "text-muted-foreground";
  };

  const getActivityBgColor = (type: string): string => {
    if (type === "agent.run.complete") return "bg-green-100 dark:bg-green-900";
    if (type === "agent.run.error") return "bg-red-100 dark:bg-red-900";
    if (type === "agent.run") return "bg-blue-100 dark:bg-blue-900";
    if (type.startsWith("tool.")) return "bg-purple-100 dark:bg-purple-900";
    if (type.startsWith("conversation.")) return "bg-orange-100 dark:bg-orange-900";
    if (type.startsWith("channel.")) return "bg-cyan-100 dark:bg-cyan-900";
    if (type.startsWith("calendar.")) return "bg-pink-100 dark:bg-pink-900";
    return "bg-muted";
  };

  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    return "just now";
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const activityDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (activityDate.getTime() === today.getTime()) {
      return `Today at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } else if (activityDate.getTime() === yesterday.getTime()) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined }) + 
        ` at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
  };

  const groupActivitiesByRelativePeriod = (activities: ActivityItem[]): Record<string, ActivityItem[]> => {
    const groups: Record<string, ActivityItem[]> = {};
    const now = Date.now();
    
    activities.forEach((activity) => {
      const timestamp = activity.timestamp;
      const diff = now - timestamp;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);
      
      let periodKey: string;
      if (hours < 1) {
        periodKey = "Last hour";
      } else if (hours < 24) {
        periodKey = "Last day";
      } else if (days < 7) {
        periodKey = "Last 7 days";
      } else if (days < 30) {
        periodKey = "Last 30 days";
      } else {
        periodKey = "Older";
      }
      
      if (!groups[periodKey]) {
        groups[periodKey] = [];
      }
      groups[periodKey].push(activity);
    });
    
    // Sort groups in a logical order
    const orderedGroups: Record<string, ActivityItem[]> = {};
    const order = ["Last hour", "Last day", "Last 7 days", "Last 30 days", "Older"];
    order.forEach(key => {
      if (groups[key]) {
        orderedGroups[key] = groups[key];
      }
    });
    
    return orderedGroups;
  };

  const getActivityDescription = (activity: ActivityItem): string => {
    const { type, metadata } = activity;
    
    if (type === "agent.run" && metadata.message) {
      return `"${String(metadata.message).substring(0, 100)}${String(metadata.message).length > 100 ? "..." : ""}"`;
    }
    if (type === "agent.run.complete" && metadata.response) {
      return `Response: "${String(metadata.response).substring(0, 100)}${String(metadata.response).length > 100 ? "..." : ""}"`;
    }
    if (type === "agent.run.error" && metadata.error) {
      return String(metadata.error);
    }
    if (type === "tool.call" && metadata.toolName) {
      return `Tool: ${String(metadata.toolName)}`;
    }
    if (type === "tool.result" && metadata.toolName) {
      return `Tool: ${String(metadata.toolName)} completed`;
    }
    if (type === "conversation.create" && metadata.conversationLabel) {
      return `Conversation: ${String(metadata.conversationLabel)}`;
    }
    if (type === "channel.message.incoming" && metadata.channel && metadata.from) {
      return `From ${String(metadata.from)} via ${String(metadata.channel)}`;
    }
    if (type === "channel.message.outgoing" && metadata.channel && metadata.to) {
      return `To ${String(metadata.to)} via ${String(metadata.channel)}`;
    }
    if (type.startsWith("calendar.") && metadata.eventTitle) {
      return `Event: ${String(metadata.eventTitle)}`;
    }
    
    return "";
  };

  // Filter conversations for this agent, sorted by lastActivity (most recent first)
  const agentConversations = state.conversations.filter((s) => s.agentId === agentId);
  const activeAgentConversations = agentConversations
    .filter((s) => state.activeConversationIds.has(s.id))
    .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  const archivedAgentConversations = agentConversations
    .filter((s) => !state.activeConversationIds.has(s.id))
    .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));

  // Common tools list (based on project structure)
  const commonTools = ["terminal", "browser", "canvas", "cron", "tts"];

  const handleRunAgent = () => {
    if (state.currentAgentId !== agentId) {
      state.setCurrentAgentId(agentId);
    }
    onClose();
  };


  return (
    <div className="flex-1 overflow-hidden bg-background" style={{ minHeight: 0, width: '100%', maxWidth: '100%' }}>
      <ResizablePanelGroup 
        orientation="horizontal" 
        className="h-full w-full"
      >
        <ResizablePanel 
          defaultSize={100} 
          minSize={30}
          maxSize={100}
        >
          <div className="h-full overflow-y-auto" style={{ width: '100%', overflowX: 'hidden' }}>
            <div className="max-w-4xl mx-auto w-full px-6 py-8">
          {/* Header with tabs */}
          <div className="mb-8 pb-6 border-b border-border">
            <div className="flex items-center justify-between mb-4">
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

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Bot className="h-5 w-5 text-muted-foreground" />
                <h1 className="text-2xl font-semibold text-foreground">{agentId}</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                {activeTab === "overview" && "Agent overview and quick actions"}
                {activeTab === "prompts" && "System prompts, behavior, and identity"}
                {activeTab === "tools" && "Available tools and capabilities"}
                {activeTab === "conversations" && "Active and archived conversations"}
                {activeTab === "activities" && "Agent activity logs and history"}
              </p>
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
                        <div className="text-sm text-muted-foreground mb-1">Active Conversations</div>
                        <div className="text-2xl font-semibold text-foreground">
                          {activeAgentConversations.length}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Total Conversations</div>
                        <div className="text-2xl font-semibold text-foreground">
                          {agentConversations.length}
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
                        state.createConversation("main", agentId).then(() => onClose());
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      New Conversation
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
                ) : prompts && prompts.files ? (
                  <>
                    {Object.entries(prompts.files)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([fileName, content]) => (
                        <div key={fileName} className="border border-border rounded-md bg-card">
                          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                            <h2 className="text-base font-semibold text-foreground capitalize">
                              {fileName.replace(".md", "").replace(/-/g, " ")}
                            </h2>
                            {editingFile === fileName ? (
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingFile(null);
                                    // Reset edited content for this file
                                    if (prompts.files) {
                                      setEditedContent((prev) => ({
                                        ...prev,
                                        [fileName]: prompts.files![fileName],
                                      }));
                                    }
                                  }}
                                  disabled={saving}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => savePromptFile(fileName)}
                                  disabled={saving}
                                >
                                  {saving ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Saving...
                                    </>
                                  ) : (
                                    "Save"
                                  )}
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingFile(fileName);
                                  if (!editedContent[fileName] && prompts.files) {
                                    setEditedContent((prev) => ({
                                      ...prev,
                                      [fileName]: prompts.files![fileName] || "",
                                    }));
                                  }
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </Button>
                            )}
                          </div>
                          <div className="max-h-[400px] overflow-y-auto">
                            {editingFile === fileName ? (
                              <textarea
                                value={editedContent[fileName] || ""}
                                onChange={(e) =>
                                  setEditedContent((prev) => ({
                                    ...prev,
                                    [fileName]: e.target.value,
                                  }))
                                }
                                className="w-full px-6 py-4 text-sm font-mono text-foreground bg-background border-0 focus:outline-none resize-none"
                                rows={15}
                                style={{ minHeight: "200px" }}
                              />
                            ) : (
                              <pre className="px-6 py-4 text-sm font-mono text-foreground whitespace-pre-wrap">
                                {content}
                              </pre>
                            )}
                          </div>
                        </div>
                      ))}
                    {Object.keys(prompts.files).length === 0 && (
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

            {activeTab === "conversations" && (
              <div className="space-y-6">
                {/* Active Conversations */}
                {activeAgentConversations.length > 0 && (
                  <div className="border border-border rounded-md bg-card">
                    <div className="px-6 py-4 border-b border-border">
                      <h2 className="text-base font-semibold text-foreground">Active Conversations</h2>
                      <Badge variant="secondary" className="ml-2">
                        {activeAgentConversations.length}
                      </Badge>
                    </div>
                    <div className="px-6 py-4 space-y-1">
                      {activeAgentConversations.map((conversation) => (
                        <div key={conversation.id} className="py-2">
                          <button
                            onClick={() => {
                              state.setCurrentConversationId(conversation.id);
                              state.addToActiveConversations(conversation.id);
                              onClose();
                            }}
                            className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium text-foreground">
                                {conversation.label || conversation.id}
                              </span>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Archived Conversations */}
                {archivedAgentConversations.length > 0 && (
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
                        <h2 className="text-base font-semibold text-foreground">Archived Conversations</h2>
                        <Badge variant="secondary">
                          {archivedAgentConversations.length}
                        </Badge>
                      </div>
                    </button>
                    {archivedExpanded && (
                      <div className="px-6 py-4 space-y-1">
                        {archivedAgentConversations.map((conversation) => (
                          <div key={conversation.id} className="py-2">
                            <button
                              onClick={() => {
                                state.setCurrentConversationId(conversation.id);
                                state.addToActiveConversations(conversation.id);
                                onClose();
                              }}
                              className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors opacity-70"
                            >
                              <div className="flex items-center gap-2">
                                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-foreground">
                                  {conversation.label || conversation.id}
                                </span>
                              </div>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {agentConversations.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    No conversations for this agent yet
                  </div>
                )}
              </div>
            )}

            {activeTab === "activities" && (
              <div className="space-y-6">
                {/* Filters - GitHub style */}
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <select
                    value={activityDateFilter}
                    onChange={(e) => setActivityDateFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="today">Today</option>
                    <option value="last7">Last 7 days</option>
                    <option value="last30">Last 30 days</option>
                    <option value="last90">Last 90 days</option>
                  </select>
                  <select
                    value={activityTypeFilter}
                    onChange={(e) => setActivityTypeFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">All activity</option>
                    <option value="agent.run">Agent runs</option>
                    <option value="tool.call">Tool calls</option>
                    <option value="conversation.create">Conversations</option>
                    <option value="channel.message.incoming">Messages</option>
                    <option value="calendar.event.triggered">Calendar events</option>
                  </select>
                  <Button
                    onClick={loadActivities}
                    disabled={loadingActivities}
                    size="sm"
                    variant="outline"
                  >
                    {loadingActivities ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Refresh"
                    )}
                  </Button>
                </div>

                {/* Activities Feed - GitHub style */}
                {loadingActivities ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : activitiesError ? (
                  <div className="border border-destructive/50 rounded-md bg-destructive/10 px-6 py-4">
                    <p className="text-sm text-destructive">{activitiesError}</p>
                  </div>
                ) : activities.length > 0 ? (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
                    
                    <div className="space-y-6">
                      {Object.entries(groupActivitiesByRelativePeriod(activities)).map(([period, periodActivities]) => (
                        <div key={period} className="relative">
                          {/* Period header */}
                          <div className="sticky top-0 z-10 py-3 mb-4 bg-background border-b border-border">
                            <h3 className="text-sm font-semibold text-foreground">{period}</h3>
                          </div>
                          
                          {/* Activities for this period */}
                          <div className="space-y-4 pl-14">
                            {periodActivities.map((activity, idx) => {
                              const description = getActivityDescription(activity);
                              const isLast = idx === periodActivities.length - 1;
                              
                              return (
                                <div key={activity.id} className="relative group">
                                  {/* Timeline dot */}
                                  <div className={`absolute -left-[37px] top-1.5 w-3 h-3 rounded-full border-2 border-background ${getActivityBgColor(activity.type)} flex items-center justify-center`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${getActivityColor(activity.type)}`} />
                                  </div>
                                  
                                  {/* Activity card */}
                                  <div className="relative bg-card border border-border rounded-lg p-4 hover:border-border/80 transition-all hover:shadow-sm">
                                    <div className="flex items-start gap-3">
                                      {/* Icon */}
                                      <div className={`mt-0.5 p-1.5 rounded-md ${getActivityBgColor(activity.type)} ${getActivityColor(activity.type)}`}>
                                        {getActivityIcon(activity.type)}
                                      </div>
                                      
                                      {/* Content */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4 mb-1">
                                          <div className="flex-1">
                                            <span className="text-sm font-medium text-foreground">
                                              {formatActivityType(activity.type)}
                                            </span>
                                            {description && (
                                              <p className="text-sm text-muted-foreground mt-1">
                                                {description}
                                              </p>
                                            )}
                                          </div>
                                          <time className="text-xs text-muted-foreground whitespace-nowrap" title={formatTime(activity.timestamp)}>
                                            {formatRelativeTime(activity.timestamp)}
                                          </time>
                                        </div>
                                        
                                        {/* Metadata badges */}
                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                          {activity.conversationId && (
                                            <Badge variant="outline" className="text-xs font-mono">
                                              {activity.conversationId.substring(0, 8)}
                                            </Badge>
                                          )}
                                          {activity.runId && (
                                            <Badge variant="outline" className="text-xs font-mono">
                                              run:{activity.runId.substring(0, 8)}
                                            </Badge>
                                          )}
                                          {typeof activity.metadata?.tokensUsed === "number" && (
                                            <Badge variant="secondary" className="text-xs">
                                              {activity.metadata.tokensUsed as number} tokens
                                            </Badge>
                                          )}
                                          {Array.isArray(activity.metadata?.toolsUsed) && (activity.metadata.toolsUsed as unknown[]).length > 0 && (
                                            <Badge variant="secondary" className="text-xs">
                                              {(activity.metadata.toolsUsed as unknown[]).length} tool{(activity.metadata.toolsUsed as unknown[]).length > 1 ? "s" : ""}
                                            </Badge>
                                          )}
                                        </div>
                                        
                                        {/* Expandable details */}
                                        {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                                          <details className="mt-3">
                                            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                                              View details
                                            </summary>
                                            <div className="mt-2 p-3 bg-muted/50 rounded-md border border-border">
                                              <pre className="text-xs font-mono text-foreground overflow-x-auto">
                                                {JSON.stringify(activity.metadata, null, 2)}
                                              </pre>
                                            </div>
                                          </details>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Timeline connector */}
                                  {!isLast && (
                                    <div className="absolute -left-8 top-8 bottom-0 w-0.5 bg-border" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                    <p className="text-sm font-medium text-foreground mb-1">No activity</p>
                    <p className="text-xs text-muted-foreground">
                      Activity will appear here as the agent runs
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
