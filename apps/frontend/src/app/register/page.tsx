"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../../lib/auth-context";
import { humanizeAuthError } from "../../lib/ux/product-error";
import { Button } from "../../components/ui/button";
import { FormField } from "../../components/ui/form-field";
import { Input } from "../../components/ui/input";

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
      setError(humanizeAuthError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="acf-page-title">注册</h1>
      <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
        <FormField label="名称" htmlFor="register-name" required>
          <Input
            id="register-name"
            placeholder="例如 小王工作室"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </FormField>
        <FormField label="邮箱" htmlFor="register-email" required>
          <Input
            id="register-email"
            type="email"
            placeholder="例如 name@studio.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </FormField>
        <FormField label="密码" htmlFor="register-password" required helper="至少 8 位，以后端校验为准。">
          <Input
            id="register-password"
            type="password"
            placeholder="设置密码"
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
          注册
        </Button>
      </form>
      <Link className="text-sm underline" href="/login">
        已有账号？登录
      </Link>
    </main>
  );
}
