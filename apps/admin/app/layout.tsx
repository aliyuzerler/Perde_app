import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider, StepUpProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: "PerdeGo Admin",
  description: "PerdeGo içerik ve işletme yönetim paneli",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-[var(--pg-bg)] text-[var(--pg-text)] antialiased">
        <ToastProvider>
          <StepUpProvider>{children}</StepUpProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
