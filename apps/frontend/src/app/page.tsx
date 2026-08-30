"use client";

import Link from "next/link";
import { useAuth } from "../lib/auth-context";

export default function Home() {
  const { session, ready, logout } = useAuth();

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p>加载中…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
        <h1 className="text-2xl font-semibold">AI Content Factory</h1>
        <p className="text-sm text-neutral-600">请登录或注册以继续。</p>
        <div className="flex gap-3">
          <Link className="rounded bg-black px-4 py-2 text-white" href="/login">
            登录
          </Link>
          <Link className="rounded border px-4 py-2" href="/register">
            注册
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">已登录</h1>
      <p className="text-sm text-neutral-600">
        {session.user.name} · {session.workspace.name}
      </p>
      <div className="flex gap-3">
        <Link className="rounded bg-black px-4 py-2 text-white" href="/dashboard">
          进入工作台
        </Link>
        <button className="rounded border px-4 py-2" onClick={() => void logout()}>
          退出登录
        </button>
      </div>
    </main>
  );
}
