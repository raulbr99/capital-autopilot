import type { Metadata } from "next";
import { Inter, Archivo_Black, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const display = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "CAPITAL AUTOPILOT // motor de posiciones autónomas",
  description: "Dashboard de trading autónomo sobre Capital.com (DEMO)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body
        className={`${body.variable} ${display.variable} ${mono.variable} bg-ink text-white font-body antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
