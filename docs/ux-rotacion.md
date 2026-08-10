# Rotación de mejora UX — "aspecto de broker moderno"

Registro del loop que revisa **un apartado distinto cada vez** y lo sube directo a `main`.
Sirve para no repetir apartado y para saber qué queda.

> ⚠️ El auto-deploy de Vercel desde GitHub está roto (último automático: 4-jul-2026).
> Después de cada push hay que lanzar `vercel deploy --prod --yes` a mano.

## Hecho

| # | Fecha | Apartado | Qué se hizo |
|---|---|---|---|
| 1 | 11-ago-2026 | **Cabecera global (chrome)** | Una sola `AppHeader` para TODA la app (antes el panel tenía la suya y las páginas internas una versión pobre sin marca ni estado). Añadido el dato que ningún broker esconde: **equity + P&L del día siempre visibles** en la cabecera, con auto-refresco cada 30 s en las páginas internas (el panel se los inyecta y no duplica peticiones). `ConnBadge` movido a `ui.tsx` como primitivo compartido. Marca con wordmark en pantallas grandes. |
| 2 | 11-ago-2026 | **Mesas** (`DeskPage`) | Barra de mesa rehecha: **píldora de estado de sesión** (abierto/cerrado calculado por horario UTC — sin ella, un tablero lleno de FLAT parece averiado cuando en realidad el mercado está cerrado), acción principal movida a la derecha en vez de colgando del título, y tira de 4 cifras reales de operador en vez de 3 cajas sueltas: **cupo de mesa** (`2/4` + libres, refleja `maxPerDesk`), **exposición nocional**, **riesgo a stop** (lo que se pierde si saltan todos) y P&L flotante. |

| 3 | 11-ago-2026 | **Tabla de posiciones** (`PositionsTable`) | Tres cosas que la separaban de un blotter profesional: (1) **fila de totales** — exposición, riesgo a stop y P&L sumados, antes había que sumar a ojo; (2) **P&L en múltiplos de R** (`+1.2R`) con minibarra de recorrido −1R→+2R, que es como puntúa un operador y permite comparar entre activos; (3) **confirmación en dos pasos al cerrar** (CERRAR → ¿CERRAR?), que mueve dinero real y antes se disparaba a la primera. Además `tabular-nums` en todas las columnas numéricas (las cifras ya no bailan al refrescar) y la tarjeta móvil lleva el P&L al encabezado con su R. |

## Pendiente (orden sugerido por impacto)

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
