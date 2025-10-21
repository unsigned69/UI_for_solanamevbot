import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solana Token Monitor",
  description: "Dashboard with unified liquidity signals for Raydium and Meteora pools.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
