"use client";

import { useRouter } from "next/navigation";
import { PageHeader, SectionHeader } from "../../../components/page-header";
import { VoiceDigitalHumanSettings } from "../../../components/voice-digital-human-settings";
import { CapabilityStatus } from "../../../components/capability-status";
import { useAuth } from "../../../lib/auth-context";
import { CLONE_NOT_CONFIGURED, DH_NOT_CONFIGURED } from "../../../lib/voice-digital-human";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { SmartFormFoundationPreview } from "../../../components/ui/smart-form-preview";
import { TechnicalDetailsPanel } from "../../../components/ui/error-state";

export default function SettingsPage() {
  const { session, logout } = useAuth();
  const router = useRouter();

  return (
    <main className="px-4 py-6 md:px-6">
      <PageHeader title="设置" description="全局设置：账号、声音与数字人、平台连接。项目名称和定位请在项目里修改。" />

      <Card className="mb-6">
        <SectionHeader title="账号" />
        <p className="acf-body-secondary mt-2">{session?.user.email}</p>
        <p className="acf-caption mt-1">{session?.user.name}</p>
        <Button
          className="mt-4"
          variant="secondary"
          type="button"
          onClick={() => void logout().then(() => router.push("/login"))}
        >
          退出登录
        </Button>
      </Card>

      <Card className="mb-6">
        <SectionHeader title="声音与数字人" description="可保存草稿档案；生成服务未配置时不会假装可以立即生成。" />
      </Card>
      <VoiceDigitalHumanSettings />

      <Card className="mb-6">
        <SectionHeader title="平台连接" description="抖音账号连接仍为测试能力，请使用手动发布，不要把它当成正式一键发布。" />
      </Card>

      <details className="rounded-[var(--acf-radius-md)] border border-[var(--acf-border)] bg-[var(--acf-surface)] p-4">
        <summary className="cursor-pointer text-sm font-medium">高级设置</summary>
        <p className="mt-2 max-w-xl text-sm text-[var(--acf-text-secondary)]">
          AI 模型默认自动选择。不在这里展示供应商地址或密钥。资源使用与成本仅供内部计量，不对普通用户展示供应商账单。
        </p>
        <div className="mt-4 space-y-3">
          <h3 className="acf-section-title">能力状态</h3>
          <CapabilityStatus
            name="自动市场研究"
            available={false}
            notConfiguredHint="自动市场研究服务尚未配置，当前会继续使用你提供的信息。"
          />
          <CapabilityStatus
            name="数字人"
            available={false}
            notConfiguredHint={DH_NOT_CONFIGURED}
            fallback="系统目前会使用旁白 + 素材继续制作。"
          />
          <CapabilityStatus
            name="自定义声音"
            available={false}
            notConfiguredHint={CLONE_NOT_CONFIGURED}
            fallback="仍可使用系统声音制作。"
          />
          <CapabilityStatus
            name="AI 视频生成"
            available={false}
            notConfiguredHint="AI 视频服务尚未配置。"
            fallback="仍可使用真实素材和 AI 画面制作。"
          />
        </div>
        <div className="mt-6">
          <h3 className="acf-section-title">智能填写预览</h3>
          <p className="acf-caption mt-1 mb-3">仅用于验证表单体验，不会保存，也不会调用模型。</p>
          <SmartFormFoundationPreview />
        </div>
        <div className="mt-6">
          <TechnicalDetailsPanel details="Workspace 与内部计量信息不对普通用户展示。密钥与 token 不会作为表单上下文复用。" />
        </div>
      </details>
    </main>
  );
}
