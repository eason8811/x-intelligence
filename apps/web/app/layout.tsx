import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "X Intelligence",
  description: "授权 X 推荐流的信息收件箱",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="font-sans">
      <body>
        <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
          <header className="flex flex-wrap items-center gap-6">
            <Link href="/dashboard" className="font-semibold">
              X Intelligence
            </Link>
            <nav aria-label="主导航" className="flex gap-4">
              <Link href="/dashboard">概览</Link>
              <Link href="/feed">信息流</Link>
              <Link href="/runs">采集记录</Link>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
