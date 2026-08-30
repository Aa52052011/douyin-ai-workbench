import type { Metadata } from "next";
import { AuthProvider } from "../lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Content Factory",
  description: "AI 抖音智能体工作台",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
