import { existsSync, appendFileSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
/**
 * Resolve transcript file path for a session
 */
export function resolveTranscriptPath(agentId, sessionId, stateDir) {
    const baseDir = stateDir || join(homedir(), ".zuckerman");
    return join(baseDir, "agents", agentId, "sessions", `${sessionId}.jsonl`);
}
/**
 * Append an entry to the transcript file
 */
export function appendTranscriptEntry(transcriptPath, entry) {
    try {
        mkdirSync(dirname(transcriptPath), { recursive: true });
        const line = JSON.stringify(entry) + "\n";
        appendFileSync(transcriptPath, line, "utf-8");
    }
    catch (error) {
        console.error(`Failed to append transcript entry to ${transcriptPath}:`, error);
        throw error;
    }
}
/**
 * Load transcript entries from a file
 */
export function loadTranscript(transcriptPath, limit) {
    const entries = [];
    try {
        if (!existsSync(transcriptPath)) {
            return entries;
        }
        const content = readFileSync(transcriptPath, "utf-8");
        const lines = content.trim().split("\n").filter((line) => line.trim());
        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                entries.push(entry);
            }
            catch (error) {
                console.warn(`Failed to parse transcript line: ${line}`, error);
            }
        }
        // Return last N entries if limit specified
        if (limit && limit > 0) {
            return entries.slice(-limit);
        }
        return entries;
    }
    catch (error) {
        console.error(`Failed to load transcript from ${transcriptPath}:`, error);
        return entries;
    }
}
/**
 * Generate a unique transcript entry ID
 */
function generateTranscriptId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
/**
 * Convert session messages to transcript entries
 */
export function messagesToTranscriptEntries(messages, parentId) {
    let lastId = parentId;
    return messages.map((msg) => {
        const id = generateTranscriptId();
        const entry = {
            id,
            parentId: lastId,
            role: msg.role === "tool" ? "tool" : msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            toolCallId: msg.toolCallId,
            toolCalls: msg.toolCalls,
            runId: msg.runId,
        };
        lastId = id;
        return entry;
    });
}
//# sourceMappingURL=transcript.js.map