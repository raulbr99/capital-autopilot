"use client";

/**
 * Última red: si el fallo ocurre en el propio layout, `error.tsx` no llega a
 * montarse. Aquí se reemplaza el documento entero, así que los estilos van
 * en línea — no hay garantía de que la hoja de estilos haya cargado.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0B0D11",
          color: "#E7E9EE",
          fontFamily: "system-ui, sans-serif",
          padding: "20px",
        }}
      >
        <div style={{ maxWidth: 420, border: "1px solid #242A33", borderRadius: 14, padding: 24 }}>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.1em", color: "#8C94A0", textTransform: "uppercase" }}>
            Error crítico
          </p>
          <h1 style={{ margin: "12px 0 0", fontSize: 22, fontWeight: 600 }}>La aplicación no ha podido arrancar</h1>
          <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6, color: "#A0A7B4" }}>
            El motor sigue operando en el servidor: tus posiciones y sus stops no dependen de esta pantalla.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: "#6E7CF7",
              color: "#0B0D11",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
          <p style={{ marginTop: 16, fontSize: 10, color: "#8C94A0", wordBreak: "break-word" }}>
            {error.message}
            {error.digest ? ` · ${error.digest}` : ""}
          </p>
        </div>
      </body>
    </html>
  );
}
