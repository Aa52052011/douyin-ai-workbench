"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../../lib/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login({ email, password });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">登录</h1>
      <form className="flex flex-col gap-3" onSubmit={(event) => void onSubmit(event)}>
        <input
          className="rounded border px-3 py-2"
          type="email"
          placeholder="邮箱"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="rounded border px-3 py-2"
          type="password"
          placeholder="密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button className="rounded bg-black px-4 py-2 text-white" disabled={pending} type="submit">
          {pending ? "登录中…" : "登录"}
        </button>
      </form>
      <Link className="text-sm underline" href="/register">
        没有账号？注册
      </Link>
    </main>
  );
}
