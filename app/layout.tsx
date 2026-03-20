import type { Metadata } from "next";
import "./globals.css";
import { DM_Serif_Display, DM_Sans } from "next/font/google";
import { cn } from "@/lib/utils";

const dmSerif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RE Intelligence — Analisi immobiliare Milano",
  description: "Dashboard di business intelligence sulle transazioni immobiliari reali a Milano. Prezzi, trend, comparabili — dati, non opinioni.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={cn(dmSerif.variable, dmSans.variable)}>
      <body>{children}</body>
    </html>
  );
}
