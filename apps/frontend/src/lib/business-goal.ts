export type BusinessGoalView = {
  businessGoal: string;
  goalCode?: string;
};

export function normalizeBusinessGoal(input: { businessGoal?: string; goalCode?: string }): BusinessGoalView {
  return {
    businessGoal: (input.businessGoal ?? "").trim(),
    goalCode: input.goalCode,
  };
}

export function formatBusinessGoalDisplay(goal: BusinessGoalView): string {
  return goal.businessGoal || "未填写";
}

export function formatBusinessGoalDetail(goal: BusinessGoalView): string | null {
  return goal.businessGoal ? null : null;
}
