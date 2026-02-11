import { Cron } from "croner";
import type { CalendarEvent } from "./types.js";
import { saveEvents } from "./storage.js";
import { executeEvent } from "./executor.js";

let cronInstances = new Map<string, Cron>();

export function getCronInstances(): Map<string, Cron> {
  return cronInstances;
}

// Calculate next occurrence for recurring events
export function calculateNextOccurrence(event: CalendarEvent): number | undefined {
  if (!event.recurrence || event.recurrence.type === "none") {
    return event.startTime > Date.now() ? event.startTime : undefined;
  }

  if (event.recurrence.type === "cron" && event.recurrence.cronExpression) {
    try {
      const cron = new Cron(event.recurrence.cronExpression, {
        timezone: event.recurrence.timezone,
      });
      const next = cron.nextRun();
      return next ? next.getTime() : undefined;
    } catch {
      return undefined;
    }
  }

  // For daily/weekly/monthly/yearly, calculate based on interval
  const now = Date.now();
  const interval = event.recurrence.interval || 1;
  let next = event.nextOccurrenceAt || event.startTime;

  if (event.recurrence.type === "daily") {
    const dayMs = 24 * 60 * 60 * 1000;
    while (next <= now) {
      next += dayMs * interval;
    }
  } else if (event.recurrence.type === "weekly") {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    while (next <= now) {
      next += weekMs * interval;
    }
  } else if (event.recurrence.type === "monthly") {
    // Approximate month as 30 days
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    while (next <= now) {
      next += monthMs * interval;
    }
  } else if (event.recurrence.type === "yearly") {
    const yearMs = 365 * 24 * 60 * 60 * 1000;
    while (next <= now) {
      next += yearMs * interval;
    }
  }

  // Check end date and count limits
  if (event.recurrence.endDate && next > event.recurrence.endDate) {
    return undefined;
  }

  return next;
}

// Schedule an event
export function scheduleEvent(event: CalendarEvent, eventsMap: Map<string, CalendarEvent>): void {
  // Stop existing cron if any
  const existing = cronInstances.get(event.id);
  if (existing) {
    existing.stop();
    cronInstances.delete(event.id);
  }

  if (!event.enabled) {
    console.log(`[Calendar] Event ${event.id} is disabled, skipping schedule`);
    return;
  }

  const nextOccurrence = calculateNextOccurrence(event);
  if (!nextOccurrence) {
    console.log(`[Calendar] No next occurrence for event ${event.id}, skipping schedule`);
    return;
  }

  event.nextOccurrenceAt = nextOccurrence;
  const delay = Math.max(0, nextOccurrence - Date.now());
  const delaySeconds = Math.floor(delay / 1000);
  const nextDate = new Date(nextOccurrence);

  // For one-time events, use setTimeout
  if (!event.recurrence || event.recurrence.type === "none") {
    // Node.js setTimeout has max delay of ~24.8 days (2^31-1 ms)
    // If delay is too large, log warning and schedule for max delay instead
    const MAX_DELAY = 2147483647; // 2^31 - 1
    if (delay > MAX_DELAY) {
      console.warn(`[Calendar] Event ${event.id} delay (${delaySeconds}s) exceeds max setTimeout delay, scheduling for max delay instead`);
      setTimeout(() => {
        // Recalculate and reschedule when max delay expires
        scheduleEvent(event, eventsMap);
      }, MAX_DELAY);
    } else {
      console.log(`[Calendar] Scheduled one-time event ${event.id} "${event.title}" for ${nextDate.toISOString()} (in ${delaySeconds}s)`);
      setTimeout(async () => {
        executeEvent(event, eventsMap).catch((err) => {
          console.error(`[Calendar] Error in scheduled event ${event.id}:`, err);
        });
      }, delay);
    }
    saveEvents(eventsMap);
    return;
  }

  // For recurring events with cron expression, use Cron library
  if (event.recurrence.type === "cron" && event.recurrence.cronExpression) {
    try {
      console.log(`[Calendar] Scheduling recurring cron event ${event.id} "${event.title}" with expression "${event.recurrence.cronExpression}" (next: ${nextDate.toISOString()})`);
      const cron = new Cron(event.recurrence.cronExpression, {
        timezone: event.recurrence.timezone,
      }, async () => {
        console.log(`[Calendar] Cron trigger fired for event ${event.id} at ${new Date().toISOString()}`);
        executeEvent(event, eventsMap).catch((err) => {
          console.error(`[Calendar] Error in cron event ${event.id}:`, err);
        });
        // Update next occurrence
        event.nextOccurrenceAt = calculateNextOccurrence(event);
        saveEvents(eventsMap);
      });
      cronInstances.set(event.id, cron);
      
      // Verify cron is scheduled
      const nextRun = cron.nextRun();
      if (nextRun) {
        console.log(`[Calendar] Cron instance created for event ${event.id}, next run: ${nextRun.toISOString()}`);
      } else {
        console.warn(`[Calendar] Cron instance created for event ${event.id} but nextRun() returned null`);
      }
    } catch (error) {
      console.error(`[Calendar] Failed to create cron for event ${event.id}:`, error);
      if (error instanceof Error) {
        console.error(`[Calendar] Cron error details:`, error.message, error.stack);
      }
    }
  } else {
    // For daily/weekly/monthly/yearly, use setTimeout with rescheduling
    const MAX_DELAY = 2147483647;
    if (delay > MAX_DELAY) {
      console.warn(`[Calendar] Event ${event.id} delay (${delaySeconds}s) exceeds max setTimeout delay, scheduling for max delay instead`);
      setTimeout(() => {
        scheduleEvent(event, eventsMap);
      }, MAX_DELAY);
    } else {
      console.log(`[Calendar] Scheduling recurring event ${event.id} "${event.title}" (${event.recurrence.type}) for ${nextDate.toISOString()} (in ${delaySeconds}s)`);
      setTimeout(async () => {
        executeEvent(event, eventsMap).catch((err) => {
          console.error(`[Calendar] Error in scheduled recurring event ${event.id}:`, err);
        });
        // Schedule next occurrence
        event.nextOccurrenceAt = calculateNextOccurrence(event);
        if (event.nextOccurrenceAt) {
          scheduleEvent(event, eventsMap);
        }
        saveEvents(eventsMap);
      }, delay);
    }
  }

  saveEvents(eventsMap);
}

// Schedule all events
export function scheduleEvents(eventsMap: Map<string, CalendarEvent>): void {
  console.log(`[Calendar] Scheduling ${eventsMap.size} events`);
  for (const event of eventsMap.values()) {
    scheduleEvent(event, eventsMap);
  }
  console.log(`[Calendar] Finished scheduling events`);
}

export function stopCronInstance(eventId: string): void {
  const cron = cronInstances.get(eventId);
  if (cron) {
    cron.stop();
    cronInstances.delete(eventId);
  }
}
