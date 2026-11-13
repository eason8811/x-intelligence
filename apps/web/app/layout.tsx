import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { Sidebar1 } from "@/components/sidebar1";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "X Intelligence",
  description: "授权 X 推荐流的信息收件箱",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={inter.variable}>
      <body>
        <TooltipProvider>
          <Sidebar1>{children}</Sidebar1>
        </TooltipProvider>
      </body>
    </html>
  );
}
