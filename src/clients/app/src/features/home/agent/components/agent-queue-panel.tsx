import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  Circle,
  Clock,
  Zap,
  Loader2,
  AlertCircle,
  PlayCircle,
  PauseCircle,
} from "lucide-react";
import type { PlanningState, Task } from "../../../../hooks/use-agent-queue";

interface AgentQueuePanelProps {
  queueState: PlanningState | null;
  loading: boolean;
  error: string | null;
  onRefresh?: () => void;
}

const URGENCY_COLORS: Record<Task["urgency"], string> = {
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

const STATUS_ICONS: Record<Task["status"], React.ReactNode> = {
  pending: <Circle className="h-3 w-3" />,
  active: <PlayCircle className="h-3 w-3" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
  cancelled: <XCircle className="h-3 w-3" />,
  failed: <XCircle className="h-3 w-3" />,
};

function TaskItem({ task }: { task: Task }) {
  const urgencyColor = URGENCY_COLORS[task.urgency];
  const statusIcon = STATUS_ICONS[task.status];

  return (
    <div className="p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`flex-shrink-0 ${task.status === "active" ? "text-primary" : "text-muted-foreground"}`}>
            {statusIcon}
          </div>
          <h4 className="text-sm font-medium text-foreground truncate">{task.title}</h4>
        </div>
        <Badge variant="outline" className={`text-xs ${urgencyColor} border`}>
          {task.urgency}
        </Badge>
      </div>
      
      {task.description && (
        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{task.description}</p>
      )}
      
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
        </div>
        {task.progress !== undefined && task.status === "active" && (
          <div className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{task.progress}%</span>
          </div>
        )}
        {task.priority !== undefined && (
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            <span>{(task.priority * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>
      
      {task.error && (
        <div className="mt-2 p-2 rounded bg-destructive/10 border border-destructive/20">
          <div className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" />
            <span>{task.error}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function AgentQueuePanel({ queueState, loading, error, onRefresh }: AgentQueuePanelProps) {
  // SWR Pattern: Only show loading on initial mount when no data exists
  if (loading && !queueState) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show error state only if we have no data to display
  if (error && !queueState) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm text-destructive text-center">{error}</p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="mt-4 text-xs text-primary hover:underline"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  // SWR: If no data and not loading, show empty state
  if (!queueState) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground text-center">No queue data available</p>
      </div>
    );
  }

  const { queue, currentTask, stats } = queueState;

  return (
    <div className="h-full w-full flex flex-col bg-background overflow-hidden" style={{ width: '100%', maxWidth: '100%' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Task Queue</h3>
          {/* SWR: Show error indicator only if we have data (non-blocking) */}
          {error && queueState && (
            <AlertCircle className="h-4 w-4 text-destructive" title={error} />
          )}
        </div>
        {stats && (
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span>Completed: {stats.totalCompleted}</span>
            <span>Failed: {stats.totalFailed}</span>
            <span>Cancelled: {stats.totalCancelled}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Active Task */}
          {currentTask && (
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
                <PlayCircle className="h-3 w-3 text-primary" />
                Active Task
              </h4>
              <TaskItem task={currentTask} />
            </div>
          )}

          {/* Pending Tasks */}
          {queue.pending.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
                <Clock className="h-3 w-3 text-muted-foreground" />
                Pending ({queue.pending.length})
              </h4>
              <div className="space-y-2">
                {queue.pending.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {/* Strategic Tasks */}
          {queue.strategic.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
                <Zap className="h-3 w-3 text-muted-foreground" />
                Strategic ({queue.strategic.length})
              </h4>
              <div className="space-y-2">
                {queue.strategic.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {/* Completed Tasks */}
          {queue.completed.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                Recently Completed ({queue.completed.length})
              </h4>
              <div className="space-y-2">
                {queue.completed.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!currentTask && queue.pending.length === 0 && queue.strategic.length === 0 && queue.completed.length === 0 && (
            <div className="text-center py-8">
              <Circle className="h-8 w-8 mx-auto text-muted-foreground mb-2 opacity-50" />
              <p className="text-xs text-muted-foreground">No tasks in queue</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
