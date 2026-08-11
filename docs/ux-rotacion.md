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

| 4 | 11-ago-2026 | **Matriz de señales + ticker** | Con 20 activos, la rejilla obligaba a barrer un muro de FLAT para dar con la única señal: ahora hay **triaje** (señal activa por confianza → con posición → resto) y **filtros con recuento** (Todas / Con señal / Abiertas). Las tarjetas sin señal se atenúan y las activas llevan filo de color. La **barra de confianza solo se pinta si hay señal** (un 66% bajo un FLAT sugería que pasaba algo). El **ticker pasa a ser de cotizaciones**: precio y variación —lo que se espera de una cinta— en vez del tipo de señal y su confianza, que es telemetría interna; se pausa al pasar el ratón. `pdec`/`price` suben a `ui.tsx` (estaban solo en la tabla), así que el forex deja de verse como `1.15` y muestra sus 5 decimales. Fuera el `SIN_ACTIVOS_EN_WATCHLIST` y el `POSICIÓN_ABIERTA` en mayúsculas con guiones bajos (estilo Sifrok, que este proyecto no usa). |

| 5 | 11-ago-2026 | **Analítica** (`AnalyticsPage`) | Tenía las cifras pero no el **criterio** para leerlas. Añadido: (1) bloque **"Mecánica del sistema"** que enfrenta el win rate con su **punto de equilibrio** (`100/(1+payoff)`) — un 35% de aciertos es excelente con payoff 2,4 y ruinoso con payoff 0,8, y sin ese contraste el dato suelto no dice nada; chip ✓/✗ según el lado en que caiga. (2) **Largos vs cortos** con barra y P&L por dirección: es el desglose que destapó el agujero de los cortos (25% vs 45%) y no estaba en la página. (3) **Aviso de muestra insuficiente** por debajo de 30 operaciones, para que nadie tome decisiones sobre ruido. `analyze()` calcula ahora `payoff`, `breakevenWinRate`, `byDirection` y `enough`. |

| 6 | 11-ago-2026 | **Diario IA** (`JournalPage`) | Era un muro de prosa: tesis de 800+ caracteres, todas desplegadas, y las entradas de puro HOLD (el 90%) pesaban igual que aquellas en las que el bot operó de verdad. Ahora: **tesis plegada a 2 líneas** con "Leer tesis completa"; **resumen de resultado por entrada** (`2 ejecutadas` / `1 sin ejecutar` / `sin operaciones`) para saber qué pasó sin leer; **triaje visual** — punto del timeline y borde en verde si se operó, rojo si algo quedó bloqueado, apagado si fue HOLD; **agrupado por día** con separador (un diario se lee por jornadas) y hora en cada entrada; contador de "N entradas · M con operación". `JournalEntry.desk` tipado (se accedía con `as any`). |

| 7 | 11-ago-2026 | **Lab** (`LabPage`) | El fallo de fondo no era estético: **mezclaba controles que tocan la cuenta REAL con simulaciones inofensivas, con idéntico aspecto** — invita a cambiar el riesgo creyendo que experimentas. Ahora hay dos pestañas explícitas: **Configuración** ("afecta al motor en vivo", con aviso de que entra en el siguiente ciclo y que las posiciones abiertas mantienen su stop) e **Investigación** ("simulación · no toca la cuenta", con una línea sobre por qué el walk-forward es lo único que dice algo del futuro). Además, esqueleto de carga en vez del texto "Cargando configuración…", y puntero a los límites de riesgo, que siguen en el panel junto a las posiciones que afectan (no se duplican). |

| 8 | 11-ago-2026 | **Estados de carga (el "frame frío")** | Mientras no había datos, el panel pintaba equity **0**, PnL **0,00%**, 0 posiciones y el motor en **"En espera"** — o sea, afirmaba que la cuenta está vacía y el bot parado, que es justo lo contrario de informar (y la razón por la que las capturas tras deploy salían engañosas). Nuevo primitivo `Skeleton` en `ui.tsx`; `StatCard` y `MiniStat` aceptan `value={null}` y pintan hueco. Aplicado a hero del motor, equity, las 4 tarjetas de cuenta y las 3 de hoy; el botón del piloto se deshabilita y dice "Cargando…" en vez de ofrecer "Activar" sobre un estado desconocido. Los `Cargando…` en texto plano de Analítica y Diario pasan a esqueletos con la forma del contenido real. |

| 9 | 11-ago-2026 | **Curva de equity** (`EquityChart`) | Aplicada la guía `dataviz`: (1) **cruz de lectura + tooltip** (puntero y táctil) — un gráfico HTML es interactivo por defecto y sin esto la curva era una forma de la que no se podía leer ni un valor; (2) **ejes con cifras**: tres referencias de equity a la derecha y extremos temporales abajo (hora en vez de fecha si el rango es de menos de un día, que si no se repetía "11 ago" dos veces); (3) **colores de token** (`stroke-long`, `fill-short`, `stroke-industrial`) en vez de los hex fijos `#34C98A`/`#F2567A`, que eran los valores del tema OSCURO y desentonaban en claro; (4) **ancho real medido con `ResizeObserver`** en vez de `viewBox` + `preserveAspectRatio="none"`, que deformaba horizontalmente el trazo y los puntos. **Bug de cifras cazado al mirar la captura** (paso 7 de la guía): GOLD marcaba **+21,32R** porque su trailing había movido el stop por delante de la entrada y el denominador del riesgo era casi cero; ahora esas posiciones muestran "asegurada" y no calculan R. |

| 10 | 11-ago-2026 | **Tema claro (barrido de color)** | Auditoría de colores fijos en toda la app: **cero hex hardcodeados** ya en `components/`. El peor caso era `PositionChart` (modal tipo TradingView), con TODA la paleta clavada en oscuro — incluido un `#252525` que ni siquiera es de este proyecto, es de la paleta Sifrok. Como lightweight-charts pinta en canvas y no entiende variables CSS, ahora se **leen los tokens con `getComputedStyle`** y se le pasan como color, más un `MutationObserver` sobre `data-theme` que lo repinta si cambias de tema con el modal abierto. `Sparkline` pasa a `currentColor` con clase de token, y el botón del piloto deja de usar `text-[#fff]` (blanco absoluto) por `text-white`, que en tema claro es tinta oscura. |

## Pendiente (orden sugerido por impacto)

- **RiskPanel / ConfigPanel**: formularios densos, aún sin repasar por dentro.
- **LogFeed**, **DesksOverview**, **ExpectancyPanel**, **SentimentBoard**, **CotPanel**.
- **CommandPalette** (⌘K) y experiencia móvil general.

## Criterio

Paleta y tokens de `globals.css` (grafito + iris, tema claro y oscuro). Nada de estilo
Sifrok. Referencia: paneles de brokers modernos — densidad alta pero jerarquía clara,
números tabulares y monoespaciados, color solo con significado (verde/rojo = dinero),
estado del sistema siempre visible.
