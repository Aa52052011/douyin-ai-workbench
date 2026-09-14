"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { FormField } from "../../components/ui/form-field";
import { Input } from "../../components/ui/input";
import { useAuth } from "../../lib/auth-context";
import { humanizeAuthError } from "../../lib/ux/product-error";

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
      router.push("/dashboard");
    } catch (err) {
      setError(humanizeAuthError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="acf-page-title">登录</h1>
      <p className="acf-body-secondary">用邮箱进入工作台。不会自动发布内容。</p>
      <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
        <FormField label="邮箱" htmlFor="login-email" required>
          <Input
            id="login-email"
            type="email"
            autoComplete="username"
            placeholder="例如 name@studio.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </FormField>
        <FormField label="密码" htmlFor="login-password" required>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="输入密码"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </FormField>
        {error ? (
          <p className="text-sm text-[var(--acf-danger)]" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={pending}>
          登录
        </Button>
      </form>
      <Link className="text-sm underline" href="/register">
        没有账号？注册
      </Link>
    </main>
  );
}
