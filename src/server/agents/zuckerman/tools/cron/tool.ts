import type { SecurityContext } from "@server/world/execution/security/types.js";
import { isToolAllowed } from "@server/world/execution/security/policy/tool-policy.js";
import type { Tool } from "../terminal/index.js";
import type { CalendarEvent, EventAction } from "./types.js";
import { getEvents, setEvents, loadEvents, saveEvents } from "./storage.js";
import { scheduleEvents, scheduleEvent, stopCronInstance } from "./scheduler.js";
import { executeEvent } from "./executor.js";
import { activityRecorder } from "@server/world/activity/index.js";

// Initialize events on module load
const loadedEvents = loadEvents();
const eventsMap = new Map<string, CalendarEvent>();
for (const event of loadedEvents) {
  eventsMap.set(event.id, event);
}
setEvents(eventsMap);
scheduleEvents(eventsMap);

export function createCronTool(): Tool {
  return {
    definition: {
      name: "cron",
      description: "Manage calendar events and scheduled tasks. Create, list, update, remove, and trigger calendar events. To create an event, use action='create' with an 'event' object containing: startTime (timestamp in milliseconds, required), title (optional), action (object with type='agentTurn' or 'systemEvent', required), and recurrence (optional). Action object requires: actionMessage (string, required), and optionally: contextMessage (string), agentId (string, defaults to 'zuckerman'), conversationTarget ('main' or 'isolated', defaults to 'isolated'), context (object with channel, to, accountId, and other fields). The context object allows attaching channel metadata and other context to the event execution. Example: {action:'create', event:{startTime:Date.now(), title:'Reminder', action:{type:'agentTurn', actionMessage:'Send me a message on Telegram saying Hi', contextMessage:'Telegram reminder for user', conversationTarget:'isolated', context:{channel:'telegram', to:'@username', accountId:'default'}}, recurrence:{type:'cron', cronExpression:'*/5 * * * *'}}}",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action: status, list, create, get, update, delete, trigger",
          },
          eventId: {
            type: "string",
            description: "Event ID (for get, update, delete, trigger actions)",
          },
          event: {
            type: "object",
            description: "Event object (for create action). REQUIRED: startTime (number, timestamp in milliseconds), action (object). Optional: title (string), endTime (number), recurrence (object), enabled (boolean). Action object: type ('agentTurn' or 'systemEvent'), actionMessage (string, required), contextMessage (string, optional), agentId (string, optional, defaults to 'zuckerman'), conversationTarget ('main' or 'isolated', optional, defaults to 'isolated'), context (object, optional) with channel (string), to (string), accountId (string), and other custom fields. The context object is used to attach channel metadata and other context to the event execution. Recurrence: {type:'none'|'daily'|'weekly'|'monthly'|'yearly'|'cron', cronExpression (for cron type, e.g., '*/5 * * * *' for every 5 minutes), interval, endDate, count, timezone}. Example: {startTime:Date.now(), title:'Reminder', action:{type:'agentTurn', actionMessage:'Send me a message on Telegram saying Hi', contextMessage:'Telegram reminder', conversationTarget:'isolated', context:{channel:'telegram', to:'@username', accountId:'default'}}, recurrence:{type:'cron', cronExpression:'*/5 * * * *'}}",
          },
          patch: {
            type: "object",
            description: "Patch object (for update action)",
          },
          upcoming: {
            type: "boolean",
            description: "Filter to show only upcoming events (for list action, default: true)",
          },
          from: {
            type: "number",
            description: "Start timestamp filter (for list action)",
          },
          to: {
            type: "number",
            description: "End timestamp filter (for list action)",
          },
        },
        required: ["action"],
      },
    },
    handler: async (params, securityContext, executionContext) => {
      try {
        const { action } = params;

        if (typeof action !== "string") {
          return {
            success: false,
            error: "action must be a string",
          };
        }

        // Check tool security
        if (securityContext) {
          const toolAllowed = isToolAllowed("cron", securityContext.toolPolicy);
          if (!toolAllowed) {
            return {
              success: false,
              error: "Calendar tool is not allowed by security policy",
            };
          }
        }

        const events = getEvents();
        const eventId = typeof params.eventId === "string" ? params.eventId : undefined;

        switch (action) {
          case "status": {
            const upcoming = Array.from(events.values())
              .filter(e => e.enabled && e.nextOccurrenceAt && e.nextOccurrenceAt > Date.now())
              .length;
            return {
              success: true,
              result: {
                enabled: true,
                eventsCount: events.size,
                activeEvents: Array.from(events.values()).filter(e => e.enabled).length,
                upcomingEvents: upcoming,
              },
            };
          }

          case "list": {
            let eventsList = Array.from(events.values());
            
            const upcoming = params.upcoming !== false;
            if (upcoming) {
              eventsList = eventsList.filter(e => 
                e.nextOccurrenceAt && e.nextOccurrenceAt > Date.now()
              );
            }

            if (params.from) {
              eventsList = eventsList.filter(e => 
                e.nextOccurrenceAt && e.nextOccurrenceAt >= (params.from as number)
              );
            }

            if (params.to) {
              eventsList = eventsList.filter(e => 
                e.nextOccurrenceAt && e.nextOccurrenceAt <= (params.to as number)
              );
            }

            // Sort by next occurrence
            eventsList.sort((a, b) => {
              const aNext = a.nextOccurrenceAt || 0;
              const bNext = b.nextOccurrenceAt || 0;
              return aNext - bNext;
            });

            const eventsData = eventsList.map(event => ({
              id: event.id,
              title: event.title,
              startTime: event.startTime,
              endTime: event.endTime,
              recurrence: event.recurrence,
              enabled: event.enabled,
              lastTriggeredAt: event.lastTriggeredAt,
              nextOccurrenceAt: event.nextOccurrenceAt,
            }));

            return {
              success: true,
              result: { events: eventsData },
            };
          }

          case "create": {
            const eventData = params.event as Partial<CalendarEvent>;
            if (!eventData || !eventData.startTime || !eventData.action) {
              return {
                success: false,
                error: "event object must include startTime and action",
              };
            }

            if (!eventData.action.actionMessage) {
              return {
                success: false,
                error: "action object must include actionMessage",
              };
            }

            const newEventId = eventData.id || `event-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            
            // Store the conversationId that created this event
            const actionWithConversationId: EventAction = {
              ...eventData.action,
              conversationIdSource: executionContext?.conversationId,
            };
            
            const event: CalendarEvent = {
              id: newEventId,
              title: eventData.title || "Untitled Event",
              startTime: eventData.startTime,
              endTime: eventData.endTime,
              recurrence: eventData.recurrence || { type: "none" },
              action: actionWithConversationId,
              enabled: eventData.enabled !== false,
              createdAt: Date.now(),
            };

            events.set(newEventId, event);
            scheduleEvent(event, events);
            saveEvents(events);

            // Record calendar event created
            const agentId = event.action.agentId || "zuckerman";
            await activityRecorder.recordCalendarEventCreated(
              agentId,
              newEventId,
              event.title,
            ).catch((err) => {
              console.warn("Failed to record calendar event created:", err);
            });

            return {
              success: true,
              result: { eventId: newEventId, event },
            };
          }

          case "get": {
            if (!eventId) {
              return {
                success: false,
                error: "eventId is required for get action",
              };
            }

            const event = events.get(eventId);
            if (!event) {
              return {
                success: false,
                error: `Event ${eventId} not found`,
              };
            }

            return {
              success: true,
              result: { event },
            };
          }

          case "update": {
            if (!eventId) {
              return {
                success: false,
                error: "eventId is required for update action",
              };
            }

            const patch = params.patch as Partial<CalendarEvent> | undefined;
            if (!patch) {
              return {
                success: false,
                error: "patch is required for update action",
              };
            }

            const event = events.get(eventId);
            if (!event) {
              return {
                success: false,
                error: `Event ${eventId} not found`,
              };
            }

            // Apply patch
            Object.assign(event, patch);
            scheduleEvent(event, events);
            saveEvents(events);

            // Record calendar event updated
            const agentId = event.action.agentId || "zuckerman";
            await activityRecorder.recordCalendarEventUpdated(
              agentId,
              eventId,
              event.title,
            ).catch((err) => {
              console.warn("Failed to record calendar event updated:", err);
            });

            return {
              success: true,
              result: { eventId, event },
            };
          }

          case "delete": {
            if (!eventId) {
              return {
                success: false,
                error: "eventId is required for delete action",
              };
            }

            const event = events.get(eventId);
            if (!event) {
              return {
                success: false,
                error: `Event ${eventId} not found`,
              };
            }

            // Stop cron instance
            stopCronInstance(eventId);

            events.delete(eventId);
            saveEvents(events);

            // Record calendar event deleted
            const agentId = event.action.agentId || "zuckerman";
            await activityRecorder.recordCalendarEventDeleted(
              agentId,
              eventId,
              event.title,
            ).catch((err) => {
              console.warn("Failed to record calendar event deleted:", err);
            });

            return {
              success: true,
              result: { eventId },
            };
          }

          case "trigger": {
            if (!eventId) {
              return {
                success: false,
                error: "eventId is required for trigger action",
              };
            }

            const event = events.get(eventId);
            if (!event) {
              return {
                success: false,
                error: `Event ${eventId} not found`,
              };
            }

            await executeEvent(event, events);

            return {
              success: true,
              result: { eventId, triggered: true },
            };
          }

          default:
            return {
              success: false,
              error: `Unknown action: ${action}. Supported: status, list, create, get, update, delete, trigger`,
            };
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
  };
}

// Export for CLI use
export function getAllEvents(): CalendarEvent[] {
  return Array.from(getEvents().values());
}

export function getUpcomingEvents(limit?: number): CalendarEvent[] {
  const upcoming = Array.from(getEvents().values())
    .filter(e => e.enabled && e.nextOccurrenceAt && e.nextOccurrenceAt > Date.now())
    .sort((a, b) => (a.nextOccurrenceAt || 0) - (b.nextOccurrenceAt || 0));
  
  return limit ? upcoming.slice(0, limit) : upcoming;
}
