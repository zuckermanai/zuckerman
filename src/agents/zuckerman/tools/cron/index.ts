import { Cron } from "croner";
import type { SecurityContext } from "@world/execution/security/types.js";
import { isToolAllowed } from "@world/execution/security/policy/tool-policy.js";
import type { Tool, ToolDefinition, ToolResult } from "../terminal/index.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const CRON_DIR = join(homedir(), ".zuckerman", "cron");
const JOBS_FILE = join(CRON_DIR, "jobs.json");

interface CronJob {
  id: string;
  name?: string;
  schedule: {
    kind: "at" | "every" | "cron";
    atMs?: number;
    everyMs?: number;
    expr?: string;
    tz?: string;
  };
  payload: {
    kind: "systemEvent" | "agentTurn";
    text?: string;
    message?: string;
  };
  sessionTarget: "main" | "isolated";
  enabled: boolean;
  lastRunAt?: number;
  nextRunAt?: number;
}

let jobs = new Map<string, CronJob>();
let cronInstances = new Map<string, Cron>();

// Load jobs from disk
function loadJobs(): void {
  if (!existsSync(CRON_DIR)) {
    mkdirSync(CRON_DIR, { recursive: true });
  }

  if (existsSync(JOBS_FILE)) {
    try {
      const data = readFileSync(JOBS_FILE, "utf-8");
      const jobsArray = JSON.parse(data) as CronJob[];
      jobs.clear();
      for (const job of jobsArray) {
        jobs.set(job.id, job);
      }
      scheduleJobs();
    } catch (error) {
      console.error("[Cron] Failed to load jobs:", error);
    }
  }
}

// Save jobs to disk
function saveJobs(): void {
  if (!existsSync(CRON_DIR)) {
    mkdirSync(CRON_DIR, { recursive: true });
  }

  try {
    const jobsArray = Array.from(jobs.values());
    writeFileSync(JOBS_FILE, JSON.stringify(jobsArray, null, 2), "utf-8");
  } catch (error) {
    console.error("[Cron] Failed to save jobs:", error);
  }
}

// Schedule a job
function scheduleJob(job: CronJob): void {
  // Stop existing cron if any
  const existing = cronInstances.get(job.id);
  if (existing) {
    existing.stop();
  }

  if (!job.enabled) {
    return;
  }

  let cron: Cron | null = null;

  if (job.schedule.kind === "at") {
    // One-shot at specific time
    const atMs = job.schedule.atMs || Date.now() + 1000;
    const delay = Math.max(0, atMs - Date.now());
    setTimeout(() => {
      executeJob(job);
    }, delay);
    job.nextRunAt = atMs;
  } else if (job.schedule.kind === "every") {
    // Recurring interval
    const everyMs = job.schedule.everyMs || 60000;
    cron = new Cron(`*/${Math.floor(everyMs / 1000)} * * * * *`, {
      timezone: job.schedule.tz,
    }, () => {
      executeJob(job);
    });
    cronInstances.set(job.id, cron);
  } else if (job.schedule.kind === "cron") {
    // Cron expression
    cron = new Cron(job.schedule.expr || "0 * * * *", {
      timezone: job.schedule.tz,
    }, () => {
      executeJob(job);
    });
    cronInstances.set(job.id, cron);
  }

  saveJobs();
}

// Schedule all jobs
function scheduleJobs(): void {
  for (const job of jobs.values()) {
    scheduleJob(job);
  }
}

// Execute a job
async function executeJob(job: CronJob): Promise<void> {
  console.log(`[Cron] Executing job: ${job.id} (${job.name || "unnamed"})`);
  job.lastRunAt = Date.now();

  // TODO: Actually execute the job payload
  // For now, just log it
  if (job.payload.kind === "systemEvent") {
    console.log(`[Cron] System event: ${job.payload.text}`);
  } else if (job.payload.kind === "agentTurn") {
    console.log(`[Cron] Agent turn: ${job.payload.message}`);
  }

  saveJobs();
}

// Initialize on module load
loadJobs();

export function createCronTool(): Tool {
  return {
    definition: {
      name: "cron",
      description: "Manage scheduled cron jobs. Create, list, update, remove, and run scheduled tasks.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action: status, list, add, update, remove, run",
          },
          jobId: {
            type: "string",
            description: "Job ID (for update, remove, run actions)",
          },
          job: {
            type: "object",
            description: "Job object (for add action)",
          },
          patch: {
            type: "object",
            description: "Patch object (for update action)",
          },
        },
        required: ["action"],
      },
    },
    handler: async (params, securityContext) => {
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
              error: "Cron tool is not allowed by security policy",
            };
          }
        }

        switch (action) {
          case "status": {
            return {
              success: true,
              result: {
                enabled: true,
                jobsCount: jobs.size,
                activeJobs: Array.from(jobs.values()).filter(j => j.enabled).length,
              },
            };
          }

          case "list": {
            const jobsList = Array.from(jobs.values()).map(job => ({
              id: job.id,
              name: job.name,
              schedule: job.schedule,
              enabled: job.enabled,
              lastRunAt: job.lastRunAt,
              nextRunAt: job.nextRunAt,
            }));
            return {
              success: true,
              result: { jobs: jobsList },
            };
          }

          case "add": {
            const jobData = params.job as Partial<CronJob>;
            if (!jobData || !jobData.schedule || !jobData.payload || !jobData.sessionTarget) {
              return {
                success: false,
                error: "job object must include schedule, payload, and sessionTarget",
              };
            }

            const jobId = jobData.id || `job-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const job: CronJob = {
              id: jobId,
              name: jobData.name,
              schedule: jobData.schedule,
              payload: jobData.payload,
              sessionTarget: jobData.sessionTarget,
              enabled: jobData.enabled !== false,
            };

            jobs.set(jobId, job);
            scheduleJob(job);
            saveJobs();

            return {
              success: true,
              result: { jobId, job },
            };
          }

          case "update": {
            const jobId = typeof params.jobId === "string" ? params.jobId : undefined;
            const patch = params.patch as Partial<CronJob> | undefined;

            if (!jobId || !patch) {
              return {
                success: false,
                error: "jobId and patch are required for update action",
              };
            }

            const job = jobs.get(jobId);
            if (!job) {
              return {
                success: false,
                error: `Job ${jobId} not found`,
              };
            }

            // Apply patch
            Object.assign(job, patch);
            scheduleJob(job);
            saveJobs();

            return {
              success: true,
              result: { jobId, job },
            };
          }

          case "remove": {
            const jobId = typeof params.jobId === "string" ? params.jobId : undefined;
            if (!jobId) {
              return {
                success: false,
                error: "jobId is required for remove action",
              };
            }

            const job = jobs.get(jobId);
            if (!job) {
              return {
                success: false,
                error: `Job ${jobId} not found`,
              };
            }

            // Stop cron instance
            const cron = cronInstances.get(jobId);
            if (cron) {
              cron.stop();
              cronInstances.delete(jobId);
            }

            jobs.delete(jobId);
            saveJobs();

            return {
              success: true,
              result: { jobId },
            };
          }

          case "run": {
            const jobId = typeof params.jobId === "string" ? params.jobId : undefined;
            if (!jobId) {
              return {
                success: false,
                error: "jobId is required for run action",
              };
            }

            const job = jobs.get(jobId);
            if (!job) {
              return {
                success: false,
                error: `Job ${jobId} not found`,
              };
            }

            await executeJob(job);

            return {
              success: true,
              result: { jobId, executed: true },
            };
          }

          default:
            return {
              success: false,
              error: `Unknown action: ${action}. Supported: status, list, add, update, remove, run`,
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
