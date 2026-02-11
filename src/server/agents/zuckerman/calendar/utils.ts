import type { CalendarEvent } from "./types.js";
import { getEvents } from "./storage.js";

export function getAllEvents(): CalendarEvent[] {
  return Array.from(getEvents().values());
}

export function getUpcomingEvents(limit?: number): CalendarEvent[] {
  const upcoming = Array.from(getEvents().values())
    .filter((e) => e.enabled && e.nextOccurrenceAt && e.nextOccurrenceAt > Date.now())
    .sort((a, b) => (a.nextOccurrenceAt || 0) - (b.nextOccurrenceAt || 0));

  return limit ? upcoming.slice(0, limit) : upcoming;
}
