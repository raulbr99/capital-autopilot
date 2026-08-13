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
            El motor sigue operando en el servidor: tus posiciones y sus stops no dependen de esta
            pantalla. Si necesitas cerrar algo ahora mismo, entra directamente en el broker.
          </p>
          {/*
            Salidas, no solo un reintento.
            Esta pantalla aparece cuando falla el layout entero, o sea cuando la
            aplicación está MÁS rota — y era la única de las tres que no ofrecía
            ninguna alternativa: solo un botón que vuelve a montar exactamente lo
            que acaba de romperse. La frontera por ruta, que salta cuando el
            resto de la app sigue funcionando, sí lleva "Ir al panel" y "Abrir
            Capital.com" desde siempre. Estaba justo al revés de como debe estar:
            cuanto menos funciona el panel, más falta hace el camino directo al
            broker para poder cerrar una posición a mano.
          */}
          <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              onClick={reset}
              style={{
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
            <a
              href="/"
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "1px solid #3A414C",
                color: "#A0A7B4",
                fontWeight: 500,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              Recargar el panel
            </a>
            <a
              href="https://capital.com"
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "1px solid #3A414C",
                color: "#A0A7B4",
                fontWeight: 500,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              Abrir Capital.com
            </a>
          </div>
          <p style={{ marginTop: 16, fontSize: 10, color: "#8C94A0", wordBreak: "break-word" }}>
            {error.message}
            {error.digest ? ` · ${error.digest}` : ""}
          </p>
        </div>
      </body>
    </html>
  );
}
