import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import PWARegister from "@/components/PWARegister";

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
  // Estaba en inglés con la descripción de al lado en español. Es el título que
  // ve la pestaña del navegador durante los ~8 s que tarda el primer tick en
  // sustituirlo por el P&L del día, y el que queda en el historial y en los
  // marcadores.
  title: "Capital Autopilot — panel de trading autónomo",
  description: "Panel de trading autónomo sobre Capital.com",
  applicationName: "Capital Autopilot",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Autopilot" },
  /**
   * Fuera de los buscadores.
   *
   * Esto no es una web: es el mando de una cuenta con dinero real, hoy sin
   * contraseña, desde el que se cierran posiciones y se para el motor. No había
   * ni robots.txt ni meta robots, así que nada impedía indexarlo si la URL se
   * filtra alguna vez — y las URL de vercel.app aparecen en los registros
   * públicos de certificados, no son un secreto.
   *
   * No sustituye a DASHBOARD_PASSWORD (eso es la puerta; esto es no salir en la
   * guía), pero cuesta cero y quita el peor camino: que alguien lo ENCUENTRE
   * sin buscarlo.
   */
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: "#0B0D11",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        <PWARegister />
      </body>
    </html>
  );
}
