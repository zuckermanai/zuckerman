import { randomUUID } from "node:crypto";
import { saveActivity } from "./storage.js";
import type { Activity, ActivityType } from "./types.js";

class ActivityRecorder {
  /**
   * Record an activity
   */
  async record(
    type: ActivityType,
    metadata: Activity["metadata"],
    options?: {
      agentId?: string;
      conversationId?: string;
      runId?: string;
      timestamp?: number;
    },
  ): Promise<void> {
    const activity: Activity = {
      id: randomUUID(),
      type,
      timestamp: options?.timestamp || Date.now(),
      agentId: options?.agentId,
      conversationId: options?.conversationId,
      runId: options?.runId,
      metadata,
    };
    
    try {
      await saveActivity(activity);
    } catch (error) {
      // Don't throw - activity recording should not break the main flow
      console.warn(`Failed to record activity ${type}:`, error);
    }
  }
  
  /**
   * Record agent run start
   */
  async recordAgentRunStart(
    agentId: string,
    conversationId: string,
    runId: string,
    message: string,
  ): Promise<void> {
    await this.record("agent.run", {
      message,
    }, {
      agentId,
      conversationId,
      runId,
    });
  }
  
  /**
   * Record agent run completion
   */
  async recordAgentRunComplete(
    agentId: string,
    conversationId: string,
    runId: string,
    response: string,
    tokensUsed?: number,
    toolsUsed?: string[],
  ): Promise<void> {
    await this.record("agent.run.complete", {
      response,
      tokensUsed,
      toolsUsed,
    }, {
      agentId,
      conversationId,
      runId,
    });
  }
  
  /**
   * Record agent run error
   */
  async recordAgentRunError(
    agentId: string,
    conversationId: string,
    runId: string,
    error: string,
  ): Promise<void> {
    await this.record("agent.run.error", {
      error,
    }, {
      agentId,
      conversationId,
      runId,
    });
  }
  
  /**
   * Record tool call
   */
  async recordToolCall(
    agentId: string,
    conversationId: string,
    runId: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
  ): Promise<void> {
    await this.record("tool.call", {
      toolName,
      toolArgs,
    }, {
      agentId,
      conversationId,
      runId,
    });
  }
  
  /**
   * Record tool result
   */
  async recordToolResult(
    agentId: string,
    conversationId: string,
    runId: string,
    toolName: string,
    toolResult: unknown,
  ): Promise<void> {
    await this.record("tool.result", {
      toolName,
      toolResult,
    }, {
      agentId,
      conversationId,
      runId,
    });
  }
  
  /**
   * Record tool error
   */
  async recordToolError(
    agentId: string,
    conversationId: string,
    runId: string,
    toolName: string,
    error: string,
  ): Promise<void> {
    await this.record("tool.error", {
      toolName,
      toolError: error,
    }, {
      agentId,
      conversationId,
      runId,
    });
  }
  
  /**
   * Record agent message
   */
  async recordAgentMessage(
    agentId: string,
    conversationId: string,
    runId: string,
    message: string,
  ): Promise<void> {
    await this.record("agent.message", {
      message,
    }, {
      agentId,
      conversationId,
      runId,
    });
  }
  
  /**
   * Record agent response
   */
  async recordAgentResponse(
    agentId: string,
    conversationId: string,
    runId: string,
    response: string,
  ): Promise<void> {
    await this.record("agent.response", {
      response,
    }, {
      agentId,
      conversationId,
      runId,
    });
  }
  
  /**
   * Record self error
   */
  async recordSelfError(
    agentId: string,
    conversationId: string,
    runId: string,
    errorContext: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error && error.stack ? error.stack : undefined;
    
    await this.record("self.error", {
      errorContext,
      errorMessage,
      errorStack,
    }, {
      agentId,
      conversationId,
      runId,
    });
  }
  
  /**
   * Record conversation creation
   */
  async recordConversationCreate(
    agentId: string,
    conversationId: string,
    conversationType: string,
    conversationLabel: string,
  ): Promise<void> {
    await this.record("conversation.create", {
      conversationType,
      conversationLabel,
    }, {
      agentId,
      conversationId,
    });
  }
  
  /**
   * Record conversation update
   */
  async recordConversationUpdate(
    agentId: string,
    conversationId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.record("conversation.update", metadata || {}, {
      agentId,
      conversationId,
    });
  }

  /**
   * Record incoming channel message
   */
  async recordChannelMessageIncoming(
    agentId: string,
    conversationId: string,
    channel: string,
    from: string,
    content: string,
  ): Promise<void> {
    await this.record("channel.message.incoming", {
      channel,
      from,
      content,
    }, {
      agentId,
      conversationId,
    });
  }
  
  /**
   * Record outgoing channel message
   */
  async recordChannelMessageOutgoing(
    agentId: string,
    conversationId: string,
    channel: string,
    to: string,
    content: string,
  ): Promise<void> {
    await this.record("channel.message.outgoing", {
      channel,
      to,
      content,
    }, {
      agentId,
      conversationId,
    });
  }
  
  /**
   * Record calendar event triggered
   */
  async recordCalendarEventTriggered(
    agentId: string,
    eventId: string,
    eventTitle: string,
    conversationId?: string,
  ): Promise<void> {
    await this.record("calendar.event.triggered", {
      eventId,
      eventTitle,
    }, {
      agentId,
      conversationId,
    });
  }
  
  /**
   * Record calendar event created
   */
  async recordCalendarEventCreated(
    agentId: string,
    eventId: string,
    eventTitle: string,
  ): Promise<void> {
    await this.record("calendar.event.created", {
      eventId,
      eventTitle,
    }, {
      agentId,
    });
  }
  
  /**
   * Record calendar event updated
   */
  async recordCalendarEventUpdated(
    agentId: string,
    eventId: string,
    eventTitle: string,
  ): Promise<void> {
    await this.record("calendar.event.updated", {
      eventId,
      eventTitle,
    }, {
      agentId,
    });
  }
  
  /**
   * Record calendar event deleted
   */
  async recordCalendarEventDeleted(
    agentId: string,
    eventId: string,
    eventTitle: string,
  ): Promise<void> {
    await this.record("calendar.event.deleted", {
      eventId,
      eventTitle,
    }, {
      agentId,
    });
  }

  /**
   * Record awareness queue drained
   */
  async recordAwarenessQueueDrained(
    agentId: string,
    conversationId: string,
    itemsProcessed: number,
  ): Promise<void> {
    await this.record("awareness.queue.drained", {
      itemsProcessed,
    }, {
      agentId,
      conversationId,
    });
  }
}

// Singleton instance
export const activityRecorder = new ActivityRecorder();
