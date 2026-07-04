# Capital Autopilot — PRODUCT.md

## Register
**Product.** Consola de monitorización y control de un bot de trading autónomo con dinero REAL. El diseño sirve a la tarea: leer el estado de la cuenta de un vistazo, auditar lo que decide la IA y actuar (parar, cerrar, ajustar riesgo) sin fricción. No es marketing; es una herramienta que se usa a diario, ahora también desde el móvil (PWA).

## Usuarios y propósito
- **Usuario único**: Raúl, dueño del bot y del dinero. Contexto: lo consulta varias veces al día (escritorio) y en el móvil (PWA instalada). Estado mental: "¿va todo bien? ¿qué ha hecho el bot? ¿pierdo o gano?"
- **Trabajo a hacer**: (1) triage en <10 segundos — equity, P&L del día, posiciones, ¿algo raro?; (2) auditoría — por qué la IA abrió/cerró/vetó; (3) control — parar el bot, cerrar una posición, ajustar riesgo.
- **Jerarquía de la verdad**: el dinero primero (equity/P&L), las posiciones después, la telemetría (logs, señales) al final.

## Personalidad de marca
Sobrio, preciso, honesto. Como una terminal financiera bien hecha: densidad con calma, números tabulares, cero adornos. La emoción viene del P&L (verde/rojo), no de la decoración. El bot maneja dinero real: el tono visual debe transmitir control, nunca juego.

## Anti-referencias
- NO estética "meme-industrial" de Sifrok (pedido explícito del dueño).
- NO casino/gamificación (confeti, badges, glows para P&L).
- NO dashboards SaaS genéricos con hero-metrics decoradas ni gradientes porque sí.
- NO sobrecarga de widgets: cada panel debe ganarse su sitio en la jerarquía de triage.

## Sistema visual (ya establecido — preservar)
- Tema oscuro por defecto + claro (toggle sol/luna, tokens en canal RGB en `globals.css`: `--ink/base/soft/raised/industrial/cement`, acento iris `#6E7CF7`, `--long` verde / `--short` rojo con el cero NEUTRO).
- Inter (UI) + JetBrains Mono (números/datos, etiquetas técnicas `tag`). Una sola familia por rol; sin display fonts.
- Radios suaves (rounded-lg/xl), hairlines `border-industrial`, paneles `bg-soft`.
- Componentes compartidos en `components/ui.tsx` (SectionHead, StatCard, Toggle, NumField, Sparkline, pnlFmt/pnlClass). Reutilizar SIEMPRE antes de inventar.

## Principios de diseño estratégicos
1. **Triage primero**: lo que cambia decisiones (equity, P&L día, kill-switch, posiciones en riesgo) arriba y grande; telemetría plegable o abajo.
2. **El cero es neutro**: P&L ±0.00 no es verde ni rojo (regla `pnlClass` existente).
3. **Estados completos**: todo panel tiene loading (skeleton `dotgrid`), vacío que enseña, y error honesto. Nada de spinners centrados.
4. **Móvil = ciudadano de primera**: la PWA se usa a diario; tap targets ≥44px, tablas → tarjetas, sin overflow horizontal.
5. **Honestidad**: si los datos son pocos o dudosos (muestra pequeña, glitch), la UI lo dice — nunca proyecta certeza que no hay.
6. **Accesibilidad**: contraste AA en texto de datos, `prefers-reduced-motion` respetado, foco visible.
