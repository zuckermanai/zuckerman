import { tool, zodSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";
import type { CalendarEvent, EventAction } from "@server/agents/zuckerman/calendar/types.js";
import { getEvents, saveEvents } from "@server/agents/zuckerman/calendar/storage.js";
import { scheduleEvent, stopCronInstance } from "@server/agents/zuckerman/calendar/scheduler.js";
import { executeEvent } from "@server/agents/zuckerman/calendar/executor.js";
import { activityRecorder } from "@server/agents/zuckerman/activity/index.js";
import "@server/agents/zuckerman/calendar/init.js";

const cronToolInputSchema = z.object({
  action: z.enum(["status", "list", "create", "get", "update", "delete", "trigger"]).describe("Action to perform"),
  eventId: z.string().optional().describe("Event ID (required for get, update, delete, trigger)"),
  event: z.any().optional().describe("Event object (required for create)"),
  patch: z.any().optional().describe("Patch object (required for update)"),
  upcoming: z.boolean().optional().describe("Filter to upcoming events only (for list, default: true)"),
  from: z.number().optional().describe("Start timestamp filter (for list)"),
  to: z.number().optional().describe("End timestamp filter (for list)"),
});

type CronToolInput = z.infer<typeof cronToolInputSchema>;

export const cronTool = tool<CronToolInput, string>({
  description:
    "Manage calendar events and scheduled tasks. Create, list, update, remove, and trigger calendar events. " +
    "To create an event, use action='create' with an 'event' object containing: startTime (timestamp in milliseconds, required), " +
    "title (optional), action (object with type='agentTurn' or 'systemEvent', required), and recurrence (optional). " +
    "Action object requires: actionMessage (string, required), and optionally: contextMessage (string), agentId (string, defaults to 'zuckerman'), " +
    "conversationTarget ('main' or 'isolated', defaults to 'isolated'), context (object with channel, to, accountId, and other fields). " +
    "The context object allows attaching channel metadata and other context to the event execution.",
  inputSchema: zodSchema(cronToolInputSchema),
  execute: async (params) => {
    try {
      const { action } = params;
      const events = getEvents();
      const eventId = params.eventId;

      switch (action) {
        case "status": {
          const upcoming = Array.from(events.values())
            .filter((e) => e.enabled && e.nextOccurrenceAt && e.nextOccurrenceAt > Date.now())
            .length;
          return JSON.stringify({
            enabled: true,
            eventsCount: events.size,
            activeEvents: Array.from(events.values()).filter((e) => e.enabled).length,
            upcomingEvents: upcoming,
          });
        }

        case "list": {
          let eventsList = Array.from(events.values());

          const upcoming = params.upcoming !== false;
          if (upcoming) {
            eventsList = eventsList.filter(
              (e) => e.nextOccurrenceAt && e.nextOccurrenceAt > Date.now(),
            );
          }

          if (params.from) {
            eventsList = eventsList.filter(
              (e) => e.nextOccurrenceAt && e.nextOccurrenceAt >= params.from!,
            );
          }

          if (params.to) {
            eventsList = eventsList.filter(
              (e) => e.nextOccurrenceAt && e.nextOccurrenceAt <= params.to!,
            );
          }

          eventsList.sort((a, b) => {
            const aNext = a.nextOccurrenceAt || 0;
            const bNext = b.nextOccurrenceAt || 0;
            return aNext - bNext;
          });

          const eventsData = eventsList.map((event) => ({
            id: event.id,
            title: event.title,
            startTime: event.startTime,
            endTime: event.endTime,
            recurrence: event.recurrence,
            enabled: event.enabled,
            lastTriggeredAt: event.lastTriggeredAt,
            nextOccurrenceAt: event.nextOccurrenceAt,
          }));

          return JSON.stringify({ events: eventsData });
        }

        case "create": {
          const eventData = params.event;
          if (!eventData || !eventData.startTime || !eventData.action) {
            throw new Error("event object must include startTime and action");
          }

          if (!eventData.action.actionMessage) {
            throw new Error("action object must include actionMessage");
          }

          const newEventId =
            eventData.id || `event-${Date.now()}-${Math.random().toString(36).substring(7)}`;

          const actionWithConversationId: EventAction = {
            ...eventData.action,
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

          const agentId = event.action.agentId || "zuckerman";
          await activityRecorder
            .recordCalendarEventCreated(agentId, newEventId, event.title)
            .catch((err) => {
              console.warn("Failed to record calendar event created:", err);
            });

          return JSON.stringify({ eventId: newEventId, event });
        }

        case "get": {
          if (!eventId) {
            throw new Error("eventId is required for get action");
          }

          const event = events.get(eventId);
          if (!event) {
            throw new Error(`Event ${eventId} not found`);
          }

          return JSON.stringify({ event });
        }

        case "update": {
          if (!eventId) {
            throw new Error("eventId is required for update action");
          }

          const patch = params.patch;
          if (!patch) {
            throw new Error("patch is required for update action");
          }

          const event = events.get(eventId);
          if (!event) {
            throw new Error(`Event ${eventId} not found`);
          }

          Object.assign(event, patch);
          scheduleEvent(event, events);
          saveEvents(events);

          const agentId = event.action.agentId || "zuckerman";
          await activityRecorder
            .recordCalendarEventUpdated(agentId, eventId, event.title)
            .catch((err) => {
              console.warn("Failed to record calendar event updated:", err);
            });

          return JSON.stringify({ eventId, event });
        }

        case "delete": {
          if (!eventId) {
            throw new Error("eventId is required for delete action");
          }

          const event = events.get(eventId);
          if (!event) {
            throw new Error(`Event ${eventId} not found`);
          }

          stopCronInstance(eventId);
          events.delete(eventId);
          saveEvents(events);

          const agentId = event.action.agentId || "zuckerman";
          await activityRecorder
            .recordCalendarEventDeleted(agentId, eventId, event.title)
            .catch((err) => {
              console.warn("Failed to record calendar event deleted:", err);
            });

          return JSON.stringify({ eventId });
        }

        case "trigger": {
          if (!eventId) {
            throw new Error("eventId is required for trigger action");
          }

          const event = events.get(eventId);
          if (!event) {
            throw new Error(`Event ${eventId} not found`);
          }

          await executeEvent(event, events);

          return JSON.stringify({ eventId, triggered: true });
        }

        default:
          throw new Error(`Unknown action: ${action}. Supported: status, list, create, get, update, delete, trigger`);
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error("Unknown error");
    }
  },
});

export function createCronTool() {
  return cronTool;
}
