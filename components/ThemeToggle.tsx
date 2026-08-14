"use client";

import { useEffect, useState } from "react";
import { alternarTema, syncThemeColor } from "./ui";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const cur = (document.documentElement.getAttribute("data-theme") as
      | "dark"
      | "light") || "dark";
    setTheme(cur);
    syncThemeColor(cur);
  }, []);

  /** El cambio lo hace el ayudante compartido; aquí solo se refleja. */
  const toggle = () => setTheme(alternarTema());

  // ...y también cuando lo cambia otro (la paleta de comandos), para que el
  // icono no se quede contando el tema anterior.
  useEffect(() => {
    const oir = (e: Event) => setTheme((e as CustomEvent).detail as "dark" | "light");
    window.addEventListener("tema:cambiado", oir);
    return () => window.removeEventListener("tema:cambiado", oir);
  }, []);

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
      aria-label="Cambiar tema"
      className="grid h-8 w-8 place-items-center rounded-lg border border-industrial text-dim transition-colors hover:border-cement hover:text-white"
    >
      {theme === "dark" ? (
        // sol
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // luna
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
