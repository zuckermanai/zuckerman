import { Command } from "commander";
import { outputJson, shouldOutputJson } from "../utils/json-output.js";
import { getCalendarEventsFile } from "@server/world/homedir/paths.js";
import { existsSync, readFileSync } from "node:fs";

const EVENTS_FILE = getCalendarEventsFile();

interface CalendarEvent {
  id: string;
  title: string;
  startTime: number;
  endTime?: number;
  recurrence?: {
    type: "none" | "daily" | "weekly" | "monthly" | "yearly" | "cron";
    interval?: number;
    endDate?: number;
    count?: number;
    cronExpression?: string;
    timezone?: string;
  };
  enabled: boolean;
  lastTriggeredAt?: number;
  nextOccurrenceAt?: number;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRecurrence(recurrence?: CalendarEvent["recurrence"]): string {
  if (!recurrence || recurrence.type === "none") {
    return "";
  }

  if (recurrence.type === "cron") {
    return `(cron: ${recurrence.cronExpression})`;
  }

  const interval = recurrence.interval && recurrence.interval > 1 
    ? `every ${recurrence.interval} ` 
    : "";
  
  return `(recurring ${interval}${recurrence.type})`;
}

function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const grouped = new Map<string, CalendarEvent[]>();
  
  for (const event of events) {
    if (!event.nextOccurrenceAt) continue;
    
    const dateKey = formatDate(event.nextOccurrenceAt);
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(event);
  }
  
  return grouped;
}

function loadEventsFromFile(): CalendarEvent[] {
  if (!existsSync(EVENTS_FILE)) {
    return [];
  }

  try {
    const data = readFileSync(EVENTS_FILE, "utf-8");
    return JSON.parse(data) as CalendarEvent[];
  } catch (error) {
    console.error("Failed to load events:", error);
    return [];
  }
}

export function createCalendarCommand(): Command {
  const cmd = new Command("calendar")
    .description("View and manage calendar events")
    .option("--json", "Output as JSON")
    .option("--all", "Show all events (including past)")
    .option("--limit <number>", "Limit number of events shown", parseInt)
    .action(async (options: { json?: boolean; all?: boolean; limit?: number }) => {
      const events = loadEventsFromFile();
      
      // Filter to upcoming events by default
      let filteredEvents = events.filter(e => 
        e.enabled && e.nextOccurrenceAt && e.nextOccurrenceAt > Date.now()
      );

      if (options.all) {
        filteredEvents = events.filter(e => e.enabled);
      }

      // Sort by next occurrence
      filteredEvents.sort((a, b) => {
        const aNext = a.nextOccurrenceAt || 0;
        const bNext = b.nextOccurrenceAt || 0;
        return aNext - bNext;
      });

      // Apply limit
      if (options.limit) {
        filteredEvents = filteredEvents.slice(0, options.limit);
      }

      if (shouldOutputJson(options)) {
        outputJson({ events: filteredEvents }, options);
        return;
      }

      if (filteredEvents.length === 0) {
        console.log("📅 No upcoming events");
        return;
      }

      // Group by date
      const grouped = groupEventsByDate(filteredEvents);
      const sortedDates = Array.from(grouped.keys()).sort((a, b) => {
        const aDate = new Date(a).getTime();
        const bDate = new Date(b).getTime();
        return aDate - bDate;
      });

      console.log("📅 Upcoming Events\n");

      for (const dateKey of sortedDates) {
        const dateEvents = grouped.get(dateKey)!;
        
        // Check if it's today or tomorrow
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        let dateLabel = dateKey;
        if (dateKey === formatDate(today.getTime())) {
          dateLabel = "Today";
        } else if (dateKey === formatDate(tomorrow.getTime())) {
          dateLabel = "Tomorrow";
        }

        console.log(`${dateLabel}`);
        
        for (const event of dateEvents) {
          const time = event.nextOccurrenceAt 
            ? formatTime(event.nextOccurrenceAt)
            : "TBD";
          const recurrence = formatRecurrence(event.recurrence);
          const recurrenceText = recurrence ? ` ${recurrence}` : "";
          console.log(`  ${time.padEnd(10)} - ${event.title}${recurrenceText}`);
        }
        
        console.log();
      }
    });

  cmd
    .command("list")
    .description("List all upcoming events")
    .option("--json", "Output as JSON")
    .option("--all", "Show all events (including past)")
    .option("--limit <number>", "Limit number of events shown", parseInt)
    .action(async (options: { json?: boolean; all?: boolean; limit?: number }) => {
      const events = loadEventsFromFile();
      
      let filteredEvents = events.filter(e => 
        e.enabled && e.nextOccurrenceAt && e.nextOccurrenceAt > Date.now()
      );

      if (options.all) {
        filteredEvents = events.filter(e => e.enabled);
      }

      filteredEvents.sort((a, b) => {
        const aNext = a.nextOccurrenceAt || 0;
        const bNext = b.nextOccurrenceAt || 0;
        return aNext - bNext;
      });

      if (options.limit) {
        filteredEvents = filteredEvents.slice(0, options.limit);
      }

      if (shouldOutputJson(options)) {
        outputJson({ events: filteredEvents }, options);
        return;
      }

      if (filteredEvents.length === 0) {
        console.log("📅 No events found");
        return;
      }

      console.log("📅 Calendar Events\n");
      for (const event of filteredEvents) {
        const date = event.nextOccurrenceAt 
          ? `${formatDate(event.nextOccurrenceAt)} at ${formatTime(event.nextOccurrenceAt)}`
          : "TBD";
        const recurrence = formatRecurrence(event.recurrence);
        console.log(`${event.id}: ${event.title}`);
        console.log(`  Scheduled: ${date}${recurrence ? ` ${recurrence}` : ""}`);
        if (event.lastTriggeredAt) {
          console.log(`  Last triggered: ${formatDate(event.lastTriggeredAt)} at ${formatTime(event.lastTriggeredAt)}`);
        }
        console.log();
      }
    });

  cmd
    .command("view <eventId>")
    .description("View details of a specific event")
    .option("--json", "Output as JSON")
    .action(async (eventId: string, options: { json?: boolean }) => {
      const events = loadEventsFromFile();
      const event = events.find(e => e.id === eventId);

      if (!event) {
        console.error(`Event "${eventId}" not found`);
        process.exit(1);
      }

      if (shouldOutputJson(options)) {
        outputJson({ event }, options);
        return;
      }

      console.log(`📅 Event: ${event.title}`);
      console.log(`ID: ${event.id}`);
      console.log(`Start: ${formatDate(event.startTime)} at ${formatTime(event.startTime)}`);
      if (event.endTime) {
        console.log(`End: ${formatDate(event.endTime)} at ${formatTime(event.endTime)}`);
      }
      if (event.recurrence && event.recurrence.type !== "none") {
        console.log(`Recurrence: ${formatRecurrence(event.recurrence)}`);
      }
      if (event.nextOccurrenceAt) {
        console.log(`Next occurrence: ${formatDate(event.nextOccurrenceAt)} at ${formatTime(event.nextOccurrenceAt)}`);
      }
      if (event.lastTriggeredAt) {
        console.log(`Last triggered: ${formatDate(event.lastTriggeredAt)} at ${formatTime(event.lastTriggeredAt)}`);
      }
      console.log(`Enabled: ${event.enabled ? "Yes" : "No"}`);
    });

  return cmd;
}
