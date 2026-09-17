"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { WorkflowOverviewDialog } from "./workflow-overview-dialog";
import {
  dismissOnboarding,
  FIRST_RUN_PRODUCT_STEPS,
  isOnboardingDismissed,
  shouldShowFirstRunOnboarding,
} from "../lib/ux/onboarding-v1";

export function FirstRunOnboardingV1({
  hasProjects,
}: {
  hasProjects: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [workflowOpen, setWorkflowOpen] = useState(false);

  useEffect(() => {
    setReady(true);
    setHidden(isOnboardingDismissed());
  }, []);

  if (!ready || !shouldShowFirstRunOnboarding(hasProjects, hidden)) return null;

  return (
    <Card className="mb-6" data-acf-first-run-onboarding-v1>
      <p className="acf-section-title">欢迎使用</p>
      <p className="acf-body mt-2">完成 3 步即可开始：</p>
      <ol className="acf-body mt-3 list-decimal space-y-1 pl-5">
        {FIRST_RUN_PRODUCT_STEPS.map((step) => (
          <li key={step.id}>
            <span className="font-medium">{step.title}。</span> {step.body}
          </li>
        ))}
      </ol>
      <p className="acf-caption mt-3">不会一次介绍全部功能。这个提示只存在于本机，关掉后不会声称已同步到服务器。</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          className="min-h-9"
          type="button"
          onClick={() => document.getElementById("create-project")?.scrollIntoView()}
        >
          创建第一个项目
        </Button>
        <Button className="min-h-9" variant="secondary" type="button" onClick={() => setWorkflowOpen(true)}>
          了解工作流程
        </Button>
        <Button
          className="min-h-9"
          variant="ghost"
          type="button"
          onClick={() => {
            dismissOnboarding();
            setHidden(true);
          }}
        >
          知道了
        </Button>
      </div>
      <p className="sr-only">开始创建第一个项目</p>
      <WorkflowOverviewDialog open={workflowOpen} onClose={() => setWorkflowOpen(false)} />
    </Card>
  );
}
