import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CryoFlow 全面测试与 HPC 调度设计",
  description:
    "CryoFlow 36 个 job 类型全面测试报告（RELION 5.0.1 + Topaz 0.3.20 + EMPIAR-10017 真实数据）与 HPC/Slurm 多 GPU 集群调度设计平台：交互式调度模拟器 + SBATCH 生成器。",
  keywords: ["CryoFlow", "RELION", "cryo-EM", "Slurm", "HPC", "Topaz", "SBATCH", "EMPIAR"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
