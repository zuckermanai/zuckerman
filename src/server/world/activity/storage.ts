import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import { getActivitiesDir, getActivityFilePath as getActivityFilePathFromPaths } from "@server/world/homedir/paths.js";
import type { Activity, ActivityQuery } from "./types.js";

const ACTIVITIES_DIR = getActivitiesDir();

/**
 * Get the file path for activities on a specific date
 */
function getActivityFilePath(date: string): string {
  return getActivityFilePathFromPaths(date);
}

/**
 * Get date string in YYYY-MM-DD format from timestamp
 */
function getDateString(timestamp: number): string {
  return new Date(timestamp).toISOString().split("T")[0];
}

/**
 * Get all date strings between from and to timestamps
 */
function getDateRange(from: number, to: number): string[] {
  const dates: string[] = [];
  const fromDate = new Date(from);
  const toDate = new Date(to);
  
  // Start from the beginning of the from date (local time, converted to UTC)
  const current = new Date(fromDate);
  current.setUTCHours(0, 0, 0, 0);
  
  // End at the beginning of the to date (local time, converted to UTC), then add one day to include the to date
  const endDate = new Date(toDate);
  endDate.setUTCHours(0, 0, 0, 0);
  endDate.setUTCDate(endDate.getUTCDate() + 1); // Include the day of 'to'
  
  while (current < endDate) {
    dates.push(getDateString(current.getTime()));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  
  return dates;
}

/**
 * Load activities from a date file
 */
function loadActivitiesFromFile(filePath: string): Activity[] {
  if (!existsSync(filePath)) {
    return [];
  }
  
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(line => line.trim());
    return lines.map(line => JSON.parse(line) as Activity);
  } catch (error) {
    console.warn(`Failed to load activities from ${filePath}:`, error);
    return [];
  }
}

/**
 * Append activity to date file
 */
export async function saveActivity(activity: Activity): Promise<void> {
  const dateStr = getDateString(activity.timestamp);
  const filePath = getActivityFilePath(dateStr);
  
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const line = JSON.stringify(activity) + "\n";
    writeFileSync(filePath, line, { flag: "a" });
  } catch (error) {
    console.error(`Failed to save activity to ${filePath}:`, error);
    throw error;
  }
}

/**
 * Query activities
 */
export function queryActivities(query: ActivityQuery): Activity[] {
  const { from, to, agentId, conversationId, type, limit, offset = 0 } = query;
  
  // Determine date range
  const now = Date.now();
  const fromTimestamp = from || now - 30 * 24 * 60 * 60 * 1000; // Default: last 30 days
  const toTimestamp = to || now;
  
  const dates = getDateRange(fromTimestamp, toTimestamp);
  
  // Load activities from all relevant date files
  let activities: Activity[] = [];
  for (const date of dates) {
    const filePath = getActivityFilePath(date);
    const fileActivities = loadActivitiesFromFile(filePath);
    activities.push(...fileActivities);
  }
  
  // Filter activities
  activities = activities.filter(activity => {
    if (activity.timestamp < fromTimestamp || activity.timestamp > toTimestamp) {
      return false;
    }
    
    if (agentId && activity.agentId !== agentId) {
      return false;
    }
    
    if (conversationId && activity.conversationId !== conversationId) {
      return false;
    }
    
    if (type) {
      const types = Array.isArray(type) ? type : [type];
      if (!types.includes(activity.type)) {
        return false;
      }
    }
    
    return true;
  });
  
  // Sort by timestamp (newest first)
  activities.sort((a, b) => b.timestamp - a.timestamp);
  
  // Apply pagination
  const paginated = activities.slice(offset, offset + (limit || activities.length));
  
  return paginated;
}

/**
 * Get activity count for a query (without loading all activities)
 */
export function getActivityCount(query: ActivityQuery): number {
  const activities = queryActivities({ ...query, limit: undefined, offset: undefined });
  return activities.length;
}

/**
 * Get available date range
 */
export function getAvailableDateRange(): { from: number; to: number } | null {
  if (!existsSync(ACTIVITIES_DIR)) {
    return null;
  }
  
  try {
    const files = readdirSync(ACTIVITIES_DIR)
      .filter(f => f.endsWith(".jsonl"))
      .map(f => f.replace(".jsonl", ""));
    
    if (files.length === 0) {
      return null;
    }
    
    files.sort();
    const fromDate = new Date(files[0]);
    const toDate = new Date(files[files.length - 1]);
    
    return {
      from: fromDate.getTime(),
      to: toDate.getTime() + 24 * 60 * 60 * 1000 - 1, // End of day
    };
  } catch (error) {
    console.warn("Failed to get available date range:", error);
    return null;
  }
}
