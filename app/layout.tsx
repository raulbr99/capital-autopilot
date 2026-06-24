import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Capital Autopilot — autonomous trading",
  description: "Panel de trading autónomo sobre Capital.com",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var p=new URLSearchParams(location.search).get('theme');var t=p||localStorage.getItem('theme')||'dark';if(p){localStorage.setItem('theme',p);}document.documentElement.setAttribute('data-theme',t);}catch(e){}})()",
          }}
        />
      </head>
      <body
        className={`${sans.variable} ${mono.variable} bg-ink text-white font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
