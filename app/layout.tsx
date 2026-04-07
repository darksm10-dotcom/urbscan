import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "URBSCAN — 楼宇情报系统",
  description: "附近写字楼与住宅查询，用于拜访获客",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
