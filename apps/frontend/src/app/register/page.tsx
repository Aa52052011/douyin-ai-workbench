"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../../lib/auth-context";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await register({ name, email, password });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">注册</h1>
      <form className="flex flex-col gap-3" onSubmit={(event) => void onSubmit(event)}>
        <input
          className="rounded border px-3 py-2"
          placeholder="名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
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
          placeholder="密码（至少 8 位，以后端校验为准）"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button className="rounded bg-black px-4 py-2 text-white" disabled={pending} type="submit">
          {pending ? "注册中…" : "注册"}
        </button>
      </form>
      <Link className="text-sm underline" href="/login">
        已有账号？登录
      </Link>
    </main>
  );
}
