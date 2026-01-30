import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prompt Battle Arena",
  description: "Multiplayer Prompt Battle Game with Real-time Sync",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
