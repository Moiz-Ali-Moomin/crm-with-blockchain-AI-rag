export interface PlanStep {
  id: string;
  description: string;
  /** Tool to call, or null for a synthesis / reasoning step */
  tool: string | null;
  toolInput: Record<string, unknown>;
  /** IDs of steps that must complete successfully before this step runs */
  dependsOn: string[];
}

export interface AgentPlan {
  thinking: string;
  steps: PlanStep[];
  /** True when the planner has enough information to produce a final answer */
  done: boolean;
  /** Populated when done === true */
  finalAnswer: string | null;
}

export interface StepResult {
  stepId: string;
  tool: string | null;
  description: string;
  success: boolean;
  data: unknown;
  error?: string;
}
