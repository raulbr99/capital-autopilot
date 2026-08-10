# Rotación de mejora UX — "aspecto de broker moderno"

Registro del loop que revisa **un apartado distinto cada vez** y lo sube directo a `main`.
Sirve para no repetir apartado y para saber qué queda.

> ⚠️ El auto-deploy de Vercel desde GitHub está roto (último automático: 4-jul-2026).
> Después de cada push hay que lanzar `vercel deploy --prod --yes` a mano.

## Hecho

| # | Fecha | Apartado | Qué se hizo |
|---|---|---|---|
| 1 | 11-ago-2026 | **Cabecera global (chrome)** | Una sola `AppHeader` para TODA la app (antes el panel tenía la suya y las páginas internas una versión pobre sin marca ni estado). Añadido el dato que ningún broker esconde: **equity + P&L del día siempre visibles** en la cabecera, con auto-refresco cada 30 s en las páginas internas (el panel se los inyecta y no duplica peticiones). `ConnBadge` movido a `ui.tsx` como primitivo compartido. Marca con wordmark en pantallas grandes. |

## Pendiente (orden sugerido por impacto)

- **Mesas** (`DeskPage`): es la pantalla más "broker" de todas y la que más se mira.
- **Tabla de posiciones** (`PositionsTable`): densidad, alineación de números, jerarquía.
- **Matriz de señales** (`SignalMatrix`) y ticker superior.
- **Analítica** (`AnalyticsPage`): gráficas y KPIs con criterio de dataviz.
- **Diario IA** (`JournalPage`): legibilidad de tesis largas.
- **Lab** (`LabPage`, `ConfigPanel`, `BacktestPanel`, `WalkForward`): formularios densos.
- **Estados vacíos y de carga** en toda la app (hoy: ceros y guiones).
- **Curva de equity** (`EquityChart`): hoy es un SVG propio muy básico.

## Criterio

Paleta y tokens de `globals.css` (grafito + iris, tema claro y oscuro). Nada de estilo
Sifrok. Referencia: paneles de brokers modernos — densidad alta pero jerarquía clara,
números tabulares y monoespaciados, color solo con significado (verde/rojo = dinero),
estado del sistema siempre visible.
