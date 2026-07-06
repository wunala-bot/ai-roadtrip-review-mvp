import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "自驾行程 AI 评审 MVP",
  description: "解析自驾旅行行程文本，并生成路线地图与每日驾驶评审。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
