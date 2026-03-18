import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RE Intelligence",
  description: "Dashboard di business intelligence sulle transazioni immobiliari reali a Milano",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
