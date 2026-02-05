import type { GatewayRequestHandlers } from "../types.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import { AgentRuntimeFactory } from "@server/world/runtime/agents/index.js";
import { agentDiscovery } from "@server/agents/discovery.js";
import { loadConfig } from "@server/world/config/index.js";
import { resolveSecurityContext } from "@server/world/execution/security/context/index.js";
import { resolveAgentHomedir } from "@server/world/communication/routing/resolver.js";
import type { StreamEvent } from "@server/world/runtime/agents/types.js";
import { sendEvent } from "../connection.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export function createAgentHandlers(
  conversationManager: ConversationManager,
  agentFactory: AgentRuntimeFactory,
): Partial<GatewayRequestHandlers> {
  return {
    "agents.list": async ({ respond }) => {
      try {
        const agents = await agentFactory.listAgents();
        respond(true, { agents });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to list agents",
        });
      }
    },

    "agents.discover": async ({ respond, params }) => {
      const agentId = params?.agentId as string | undefined;
      
      try {
        if (agentId) {
          // Get metadata for specific agent
          const metadata = agentDiscovery.getMetadata(agentId);
          if (!metadata) {
            respond(false, undefined, {
              code: "AGENT_NOT_FOUND",
              message: `Agent "${agentId}" not found in discovery service`,
            });
            return;
          }
          respond(true, { agent: metadata });
        } else {
          // Get all agent metadata
          const allMetadata = agentDiscovery.getAllMetadata();
          respond(true, { agents: allMetadata });
        }
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to discover agents",
        });
      }
    },

    "agent.run": async ({ respond, params, client }) => {
      const conversationId = params?.conversationId as string | undefined;
      const message = params?.message as string | undefined;
      const config = await loadConfig();
      
      // Resolve agent ID - check params first, then config
      let agentId = params?.agentId as string | undefined;
      if (!agentId) {
        // Get from agents.list default
        const agents = config.agents?.list || [];
        const defaultAgent = agents.find(a => a.default) || agents[0];
        agentId = defaultAgent?.id || "zuckerman";
      }
      
      const thinkingLevel = params?.thinkingLevel as string | undefined;
      const model = params?.model as { id: string; name?: string } | undefined;
      const temperature = params?.temperature as number | undefined;

      if (!conversationId) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing conversationId",
        });
        return;
      }

      if (!message) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing message",
        });
        return;
      }

      try {
        // Get the correct ConversationManager for this agent
        const agentConversationManager = agentFactory.getConversationManager(agentId);
        
        // Get or create conversation
        let conversation = agentConversationManager.getConversation(conversationId);
        let actualConversationId = conversationId;
        if (!conversation) {
          const newConversation = agentConversationManager.createConversation(`conversation-${conversationId}`, "main", agentId);
          conversation = agentConversationManager.getConversation(newConversation.id)!;
          actualConversationId = newConversation.id; // Use the actual created conversation ID
        }

        // Resolve homedir directory for this agent
        const homedirDir = resolveAgentHomedir(config, agentId);
        const securityContext = await resolveSecurityContext(
          config.security,
          actualConversationId,
          conversation.conversation.type,
          agentId,
          homedirDir,
        );

        // Add user message to conversation (use actualConversationId, not the original conversationId)
        await agentConversationManager.addMessage(actualConversationId, "user", message);

        // Get agent runtime
        let runtime: any = null;
        let loadError: string | undefined;
        try {
          runtime = await agentFactory.getRuntime(agentId, true); // Clear cache on error
        } catch (err) {
          loadError = err instanceof Error ? err.message : String(err);
          const errorStack = err instanceof Error ? err.stack : undefined;
          console.error(`[AgentHandler] Error loading runtime for "${agentId}":`, loadError);
          if (errorStack) {
            console.error(`[AgentHandler] Stack trace:`, errorStack);
          }
          
          // Try clearing cache and retrying once
          try {
            agentFactory.clearCache(agentId);
            runtime = await agentFactory.getRuntime(agentId, false); // Don't retry again
          } catch (retryErr) {
            const retryError = retryErr instanceof Error ? retryErr.message : String(retryErr);
            console.error(`[AgentHandler] Retry also failed for "${agentId}":`, retryError);
            loadError = retryError; // Use retry error if it's more specific
          }
        }
        
        if (!runtime) {
          // Check if agent is listed but runtime failed to load
          const listedAgents = await agentFactory.listAgents();
          const isListed = listedAgents.includes(agentId);
          
          // Get stored error if loadError is not set
          if (!loadError && agentFactory.getLoadError) {
            loadError = agentFactory.getLoadError(agentId);
          }
          
          const errorMessage = loadError || "Failed to load runtime (check gateway logs for details)";
          
          respond(false, undefined, {
            code: "AGENT_NOT_FOUND",
            message: isListed 
              ? `Agent "${agentId}" is listed but failed to load. Error: ${errorMessage}`
              : `Agent "${agentId}" not found. Available agents: ${listedAgents.join(", ") || "none"}`,
          });
          return;
        }

        // Create streaming callback to emit events
        const streamCallback = async (event: StreamEvent) => {
          // Emit event to the client
          try {
            // Handle queue update events specially - emit as agent.queue.update
            if (event.type === "queue" && event.data && "agentId" in event.data && "queue" in event.data) {
              sendEvent(client.socket, {
                type: "event",
                event: "agent.queue.update",
                payload: {
                  agentId: event.data.agentId as string,
                  queue: event.data.queue,
                  timestamp: (event.data.timestamp as number) || Date.now(),
                },
              });
            }
            
            // Emit standard stream event
            sendEvent(client.socket, {
              type: "event",
              event: `agent.stream.${event.type}`,
              payload: {
                ...event.data,
                conversationId: actualConversationId,
              },
            });
          } catch (err) {
            console.error(`[AgentHandler] Error sending stream event:`, err);
          }
        };

        // Pass security context to runtime (use actualConversationId)
        const result = await runtime.run({
          conversationId: actualConversationId,
          message,
          thinkingLevel: thinkingLevel as any,
          model,
          temperature,
          securityContext,
          stream: streamCallback,
        });

        // Add assistant response to conversation (use actualConversationId)
        await agentConversationManager.addMessage(actualConversationId, "assistant", result.response);

        respond(true, {
          runId: result.runId,
          response: result.response,
          tokensUsed: result.tokensUsed,
          toolsUsed: result.toolsUsed,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Agent execution failed";
        
        // Check if it's an LLM provider error
        if (errorMessage.includes("API key") || errorMessage.includes("No LLM provider")) {
          respond(false, undefined, {
            code: "LLM_CONFIG_ERROR",
            message: `${errorMessage}. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.`,
          });
        } else {
          respond(false, undefined, {
            code: "AGENT_ERROR",
            message: errorMessage,
          });
        }
      }
    },

    "agent.prompts": async ({ respond, params }) => {
      const agentId = (params?.agentId as string | undefined) || null;

      if (!agentId) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing agentId",
        });
        return;
      }

      try {
        // Clear runtime cache to ensure we load fresh prompt files
        agentFactory.clearCache(agentId);
        
        const runtime = await agentFactory.getRuntime(agentId);
        if (!runtime || !runtime.loadPrompts) {
          respond(false, undefined, {
            code: "AGENT_NOT_FOUND",
            message: `Agent "${agentId}" not found or doesn't support prompt loading`,
          });
          return;
        }

        // Clear individual prompt loader cache if available
        if (runtime.clearCache) {
          runtime.clearCache();
        }
        
        // Also clear prompt loader cache directly
        if ((runtime as any).promptLoader?.clearCache) {
          (runtime as any).promptLoader.clearCache((runtime as any).agentDir);
        }

        const prompts = await runtime.loadPrompts();
        const promptsData = prompts as {
          files?: Map<string, string>;
        };

        // Convert Map to object with filename as key
        const files: Record<string, string> = {};
        if (promptsData.files) {
          for (const [fileName, content] of promptsData.files.entries()) {
            files[fileName] = content;
          }
        }

        // Return all files dynamically
        respond(true, {
          agentId,
          files,
        });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to load prompts",
        });
      }
    },

    "agent.savePrompt": async ({ respond, params }) => {
      const agentId = params?.agentId as string | undefined;
      const fileName = params?.fileName as string | undefined;
      const content = params?.content as string | undefined;

      if (!agentId) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing agentId",
        });
        return;
      }

      if (!fileName) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing fileName",
        });
        return;
      }

      if (content === undefined) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing content",
        });
        return;
      }

      try {
        // Resolve agent directory from discovery service
        const metadata = agentDiscovery.getMetadata(agentId);
        if (!metadata) {
          respond(false, undefined, {
            code: "AGENT_NOT_FOUND",
            message: `Agent "${agentId}" not found in discovery service`,
          });
          return;
        }
        const agentDir = metadata.agentDir;
        const identityDir = join(agentDir, "core", "identity");
        
        // Ensure fileName ends with .md
        const fileWithExt = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
        const filePath = join(identityDir, fileWithExt);

        // Write file
        await writeFile(filePath, content, "utf-8");

        // Clear caches to ensure fresh load
        agentFactory.clearCache(agentId);
        const runtime = await agentFactory.getRuntime(agentId);
        if ((runtime as any).promptLoader?.clearCache) {
          (runtime as any).promptLoader.clearCache(agentDir);
        }

        respond(true, {
          agentId,
          fileName: fileWithExt,
          saved: true,
        });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to save prompt file",
        });
      }
    },

    "agent.reload": async ({ respond, params }) => {
      const agentId = params?.agentId as string | undefined;
      
      try {
        if (agentId) {
          // Clear cache for specific agent
          agentFactory.clearCache(agentId);
          respond(true, { 
            reloaded: true, 
            agentId,
            message: `Cache cleared for agent "${agentId}". Next use will reload from disk.` 
          });
        } else {
          // Clear cache for all agents
          agentFactory.clearCache();
          respond(true, { 
            reloaded: true, 
            message: "Cache cleared for all agents. Next use will reload from disk." 
          });
        }
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to reload agent cache",
        });
      }
    },

    "agent.step.confirm": async ({ respond, params }) => {
      const agentId = params?.agentId as string | undefined;
      const stepId = params?.stepId as string | undefined;
      const approved = params?.approved as boolean | undefined;

      if (!agentId) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing agentId",
        });
        return;
      }

      if (!stepId) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing stepId",
        });
        return;
      }

      if (approved === undefined) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing approved parameter",
        });
        return;
      }

      try {
        const runtime = await agentFactory.getRuntime(agentId);
        if (!runtime) {
          respond(false, undefined, {
            code: "AGENT_NOT_FOUND",
            message: `Agent "${agentId}" not found`,
          });
          return;
        }

        // Check if runtime has planning manager
        const planningManager = (runtime as any).getPlanningManager?.();
        if (!planningManager) {
          respond(false, undefined, {
            code: "FEATURE_NOT_SUPPORTED",
            message: `Agent "${agentId}" does not support step confirmation`,
          });
          return;
        }

        const reason = params?.reason as string | undefined;

        if (approved) {
          const success = planningManager.approveStepConfirmation(stepId);
          if (!success) {
            respond(false, undefined, {
              code: "CONFIRMATION_NOT_FOUND",
              message: `No pending confirmation found for step "${stepId}"`,
            });
            return;
          }
          respond(true, { approved: true, stepId });
        } else {
          const success = planningManager.rejectStepConfirmation(stepId, reason);
          if (!success) {
            respond(false, undefined, {
              code: "CONFIRMATION_NOT_FOUND",
              message: `No pending confirmation found for step "${stepId}"`,
            });
            return;
          }
          respond(true, { approved: false, stepId, reason });
        }
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to confirm step",
        });
      }
    },

    "agent.queue": async ({ respond, params, client }) => {
      const agentId = (params?.agentId as string | undefined) || null;
      const stream = params?.stream as boolean | undefined;

      if (!agentId) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing agentId",
        });
        return;
      }

      try {
        const runtime = await agentFactory.getRuntime(agentId);
        if (!runtime) {
          respond(false, undefined, {
            code: "AGENT_NOT_FOUND",
            message: `Agent "${agentId}" not found`,
          });
          return;
        }

        // Check if runtime has planning manager
        const planningManager = (runtime as any).getPlanningManager?.();
        if (!planningManager) {
          respond(false, undefined, {
            code: "FEATURE_NOT_SUPPORTED",
            message: `Agent "${agentId}" does not support queue management`,
          });
          return;
        }

        // Get current queue state
        const queueState = planningManager.getQueueState();

        if (stream) {
          // Streaming mode: send initial state and set up event listener
          respond(true, {
            queue: queueState,
            streaming: true,
          });

          // Set up periodic updates (every 1 second) while connection is open
          const intervalId = setInterval(() => {
            try {
              if (client.socket.readyState === 1) { // WebSocket.OPEN
                const currentState = planningManager.getQueueState();
                sendEvent(client.socket, {
                  type: "event",
                  event: "agent.queue.update",
                  payload: {
                    agentId,
                    queue: currentState,
                    timestamp: Date.now(),
                  },
                });
              } else {
                // Connection closed, stop interval
                clearInterval(intervalId);
              }
            } catch (err) {
              console.error(`[AgentHandler] Error sending queue update:`, err);
              clearInterval(intervalId);
            }
          }, 1000);

          // Clean up interval when connection closes
          client.socket.on("close", () => {
            clearInterval(intervalId);
          });
        } else {
          // JSON mode: return current state
          respond(true, {
            agentId,
            queue: queueState,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to get queue",
        });
      }
    },
  };
}
