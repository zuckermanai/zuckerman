/**
 * Agent Registry
 * 
 * Central registry for all agents. Import agents here to register them.
 * This replaces file system discovery with explicit imports.
 */

// Import registry to ensure side effects run (agent registration)
import "./registry.js";

export { AGENT_REGISTRY, getRegisteredAgentIds, getAgentRuntimeClass } from "./registry.js";
