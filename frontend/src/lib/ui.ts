import type { HealthResponse } from "../types";

export type UiStatus = { type: "loading" | "success" | "error"; text: string } | null;

export interface FrontendFeatureFlags {
  supervisorDashboard: boolean;
  assistantPanel: boolean;
  feedbackLoop: boolean;
  propensityModule: boolean;
}

export function getErrorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function getFrontendFeatureFlags(health?: HealthResponse | null): FrontendFeatureFlags {
  return {
    supervisorDashboard: health?.feature_flags?.supervisor_dashboard ?? true,
    assistantPanel: health?.feature_flags?.assistant_panel ?? true,
    feedbackLoop: health?.feature_flags?.feedback_loop ?? true,
    propensityModule: health?.feature_flags?.propensity_module ?? true,
  };
}
