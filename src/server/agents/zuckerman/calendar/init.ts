import type { CalendarEvent } from "./types.js";
import { loadEvents, setEvents } from "./storage.js";
import { scheduleEvents } from "./scheduler.js";

// Initialize events on module load
const loadedEvents = loadEvents();
const eventsMap = new Map<string, CalendarEvent>();
for (const event of loadedEvents) {
  eventsMap.set(event.id, event);
}
setEvents(eventsMap);
scheduleEvents(eventsMap);
