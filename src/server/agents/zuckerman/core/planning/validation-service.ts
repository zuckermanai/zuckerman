import type { LLMModel } from "@server/world/providers/llm/index.js";

export interface ValidationResult {
  satisfied: boolean;
  reason: string;
  missing: string[];
}

export class ValidationService {
  constructor(private judgeModel: LLMModel) {}

  async validate(params: {
    userRequest: string;
    systemResult: string;
  }): Promise<ValidationResult> {
    const prompt = `User asked: "${params.userRequest}"

System did: ${params.systemResult}

Does the system result satisfy what the user asked for?

Respond in JSON:
{
  "satisfied": true/false,
  "reason": "brief explanation",
  "missing": ["what's still needed if not satisfied"]
}`;

    try {
      const response = await this.judgeModel.call({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      });
      return this.parseResponse(response.content);
    } catch (error) {
      console.warn(`[ValidationService] Validation failed:`, error);
      return { satisfied: false, reason: "Validation failed", missing: [] };
    }
  }

  private parseResponse(content: string): ValidationResult {
    try {
      // Extract JSON (handle markdown code blocks)
      let jsonStr = content.trim();
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (codeBlockMatch) jsonStr = codeBlockMatch[1];
      
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];

      const parsed = JSON.parse(jsonStr);
      return {
        satisfied: Boolean(parsed.satisfied),
        reason: String(parsed.reason || "No reason provided"),
        missing: Array.isArray(parsed.missing) ? parsed.missing.map(String) : [],
      };
    } catch (error) {
      console.warn(`[ValidationService] Parse failed:`, error);
      // Fallback: infer from text
      const lower = content.toLowerCase();
      const satisfied = lower.includes('"satisfied": true') || 
                       lower.includes("satisfied: true") ||
                       (lower.includes("yes") && !lower.includes("not"));
      return { satisfied, reason: "Could not parse response", missing: [] };
    }
  }
}
