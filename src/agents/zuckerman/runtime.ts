/**
 * Agent runtime entry point
 * Re-exports the ZuckermanAwareness runtime as ZuckermanRuntime for agent discovery
 */
export { ZuckermanAwareness as ZuckermanRuntime, ZuckermanAwareness } from "./core/awareness/runtime.js";
export type { LoadedPrompts } from "./core/awareness/runtime.js";
