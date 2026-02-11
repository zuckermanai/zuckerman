import { getCalendarDir, getCalendarEventsFile } from "@server/world/homedir/paths.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { CalendarEvent } from "./types.js";

const CALENDAR_DIR = getCalendarDir();
const EVENTS_FILE = getCalendarEventsFile();

let events = new Map<string, CalendarEvent>();

export function getEvents(): Map<string, CalendarEvent> {
  return events;
}

export function setEvents(newEvents: Map<string, CalendarEvent>): void {
  events = newEvents;
}

// Load events from disk
export function loadEvents(): CalendarEvent[] {
  if (!existsSync(CALENDAR_DIR)) {
    mkdirSync(CALENDAR_DIR, { recursive: true });
  }

  if (existsSync(EVENTS_FILE)) {
    try {
      const data = readFileSync(EVENTS_FILE, "utf-8");
      const eventsArray = JSON.parse(data) as CalendarEvent[];
      return eventsArray;
    } catch (error) {
      console.error("[Calendar] Failed to load events:", error);
      return [];
    }
  }

  return [];
}

// Save events to disk
export function saveEvents(eventsMap: Map<string, CalendarEvent>): void {
  if (!existsSync(CALENDAR_DIR)) {
    mkdirSync(CALENDAR_DIR, { recursive: true });
  }

  try {
    const eventsArray = Array.from(eventsMap.values());
    writeFileSync(EVENTS_FILE, JSON.stringify(eventsArray, null, 2), "utf-8");
  } catch (error) {
    console.error("[Calendar] Failed to save events:", error);
  }
}
