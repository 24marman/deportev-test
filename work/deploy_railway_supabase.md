# Deploy V1 - Railway + Supabase

## Que Corre En Cada Lugar

Railway corre el proceso vivo:

- Monitor de partidos.
- Adaptador BSD.
- Render WebP.
- Futuro bot de X/Twitter.
- Health check para saber que el servicio esta prendido.

Supabase guarda:

- Imagenes WebP generadas.
- Estado de partidos procesados.
- Logs.
- Errores.
- Futuras publicaciones.

## Variables En Railway

Estas variables se agregan en Railway, no en archivos del proyecto:

```env
BSD_API_TOKEN=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=generated-images
MONITOR_ENABLED=false
RENDER_QUALITY=88
```

Para probar un render al arrancar:

```env
RUN_ON_START_EVENT_ID=8293
```

Cuando ya este probado, quitar `RUN_ON_START_EVENT_ID` para que no genere la misma imagen en cada restart.

## Variables Futuras Para X/Twitter

```env
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
```

## Comandos Locales

Instalar dependencias:

```bash
npm install
```

Descargar Chromium local para probar:

```bash
npx playwright install chromium
```

Generar WebP demo:

```bash
npm run render:demo
```

Arrancar worker:

```bash
npm start
```

## Salida

La salida final publicable es WebP:

```text
outputs/generated/{fecha}_{grupo}_{home}-{score}-{away}.webp
```

## Estado Actual

- Proyecto Node creado.
- Render WebP probado localmente.
- Worker arranca correctamente.
- Dockerfile listo para Railway.
- Supabase upload preparado, pendiente de poner variables reales.
- Monitor automatico completo pendiente de persistir estado en Supabase.
- Bot de X/Twitter pendiente del acceso developer/API de X.
