import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  preload: false,
});

export const metadata: Metadata = {
  title: "EDITOR — AI-Powered PDF Editor",
  description: "Professional PDF editing with AI assistance. Format-preserving text editing, annotations, redaction, and more.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased bg-white text-gray-900 ${mono.variable}`}>
        {children}
      </body>
    </html>
  );
}
