# ⚡ CAPITAL AUTOPILOT

Dashboard de **trading autónomo** sobre la API DEMO de [Capital.com](https://open-api.capital.com/).
Estética meme-industrial premium (negro profundo + Volt Yellow).

Un motor evalúa señales técnicas (cruce SMA + RSI) cada 6 s y **abre / gestiona posiciones
de forma autónoma** en tu cuenta demo. Seguimiento en vivo de equity, posiciones, señales y logs.

## ⚠️ Solo DEMO
Por defecto apunta al endpoint **demo** (`demo-api-capital.backend-capital.com`).
No es consejo financiero. No subas credenciales a git.

## Puesta en marcha

```bash
npm install
cp .env.local.example .env.local   # rellena tus credenciales DEMO
npm run dev
```

Abre http://localhost:3000

### Credenciales (cuenta DEMO de Capital.com)
1. Crea/entra en tu cuenta **demo** en capital.com.
2. Settings → **API integrations** → genera una **API Key** (te pide una "API password" propia).
3. Rellena en `.env.local`:
   - `CAPITAL_API_KEY`
   - `CAPITAL_IDENTIFIER` (tu email)
   - `CAPITAL_PASSWORD` (la API password)

Sin credenciales, el dashboard arranca igual en modo solo-UI.

## Cómo funciona

| Pieza | Archivo |
|---|---|
| Cliente API Capital.com (auth, posiciones, precios) | `lib/capital.ts` |
| Motor de señales (SMA cross + RSI) | `lib/strategy.ts` |
| Estado del bot en memoria (config, logs, equity) | `lib/store.ts` |
| Tick autónomo (evalúa y opera) | `app/api/bot/tick/route.ts` |
| Dashboard | `components/Dashboard.tsx` |

El navegador hace `POST /api/bot/tick` cada 6 s. Cada tick:
1. lee cuenta + posiciones,
2. evalúa la señal de cada activo de la watchlist,
3. si el piloto está **ACTIVADO** y hay señal con confianza suficiente, slot libre y
   sin posición previa en ese activo → abre la posición con SL/TP,
4. registra equity y eventos.

> Estado en memoria de servidor: válido para DEMO single-instance. Para producción
> multi-instancia mover `lib/store.ts` a Supabase/Redis.

## 🤖 Operación autónoma (sin navegador)

El navegador solo opera cuando la web está abierta. Para que la IA opere **24/7**
hay un endpoint de cron y dos formas de dispararlo:

### A) En Vercel (recomendado)
`vercel.json` ya define un cron cada 15 min → `GET /api/bot/cron`.
En el proyecto de Vercel define estas env vars:

| Variable | Valor |
|---|---|
| `CAPITAL_API_KEY` / `CAPITAL_IDENTIFIER` / `CAPITAL_PASSWORD` | credenciales demo |
| `CRON_SECRET` | un secreto largo aleatorio (Vercel lo manda como `Bearer`) |
| `AUTOPILOT_ARMED` | `true` para que **abra operaciones de verdad** (empieza en `false`) |

> El cron solo opera si `AUTOPILOT_ARMED=true`. Es el interruptor maestro durable.
> Capital.com es la fuente de verdad de cuenta/posiciones, así que el cron decide
> con datos en vivo aunque el estado en memoria se reinicie.
>
> Nota: cron cada 15 min requiere plan **Vercel Pro**. En Hobby el cron se limita a 1/día.

### B) En local (sin Vercel)
```bash
npm run build && npm start      # mantiene la app viva
npm run autopilot               # dispara el cron cada 15 min (configurable)
```
Variables del runner: `BASE_URL`, `INTERVAL_MIN`, `CRON_SECRET`.

### Seguimiento por IA (rutina Claude diaria)
`GET /api/bot/report` devuelve un JSON con cuenta, posiciones, PnL, stats y eventos.
Una rutina `/schedule` de Claude lo consume cada día, resume el rendimiento, señala
incidencias y te avisa. (Se configura apuntando a la URL desplegada del dashboard.)
