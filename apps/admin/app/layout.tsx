import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PerdeGo Admin",
  description: "PerdeGo içerik ve işletme yönetim paneli",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-[#0D0D0F] text-[#F5F1EA] antialiased">
        {children}
      </body>
    </html>
  );
}
