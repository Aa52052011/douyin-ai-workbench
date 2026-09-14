"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { dismissOnboarding, FIRST_RUN_STEPS, isOnboardingDismissed } from "../lib/ux/onboarding-v1";

export function FirstRunOnboardingV1({
  hasProjects,
}: {
  hasProjects: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setReady(true);
    setHidden(isOnboardingDismissed());
  }, []);

  if (!ready || hidden) return null;

  return (
    <Card className="mb-6" data-acf-first-run-onboarding-v1>
      <p className="acf-section-title">欢迎使用</p>
      <p className="acf-body mt-2">这个系统能帮你完成：账号定位 → 内容计划 → 脚本 → 视频 → 手动发布 → 数据监控 → AI复盘。</p>
      <p className="acf-body-secondary mt-2">
        {hasProjects ? "第一步已经有了项目。继续完成账号定位即可。" : "第一步：创建第一个项目。"}
      </p>
      <ol className="acf-body mt-3 list-decimal space-y-1 pl-5">
        {FIRST_RUN_STEPS.map((step) => (
          <li key={step.id}>
            <span className="font-medium">{step.title}。</span> {step.body}
          </li>
        ))}
      </ol>
      <p className="acf-caption mt-3">不会一次介绍全部功能。这个提示只存在于本机，关掉后不会声称已同步到服务器。</p>
      <Button
        className="mt-3 min-h-9"
        variant="secondary"
        type="button"
        onClick={() => {
          dismissOnboarding();
          setHidden(true);
        }}
      >
        知道了
      </Button>
    </Card>
  );
}
