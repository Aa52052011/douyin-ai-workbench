"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "../../../components/page-header";
import { useAuth } from "../../../lib/auth-context";

export default function SettingsPage() {
  const { session, logout } = useAuth();
  const router = useRouter();

  return (
    <main className="px-4 py-6 md:px-6">
      <PageHeader title="设置" description="账号与应用信息。" />
      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-medium">账号</h2>
        <p className="mt-2 text-sm text-neutral-600">{session?.user.email}</p>
        <p className="mt-1 text-sm text-neutral-500">{session?.user.name}</p>
        <button
          className="mt-4 rounded-md border px-3 py-2 text-sm"
          type="button"
          onClick={() => void logout().then(() => router.push("/login"))}
        >
          退出登录
        </button>
      </section>
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-medium">应用</h2>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          AI Content Factory 帮助你在一个项目里完成产品信息、账号定位、市场调研、内容计划和视频发布。
        </p>
      </section>
    </main>
  );
}
