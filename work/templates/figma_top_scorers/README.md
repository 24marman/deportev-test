# Template: Tabla de Goleo

Template dinámico basado en el frame de Figma `TEST2 / node 16:84`.

## Uso

```bash
npm run render:top-scorers
```

También puede renderizar datos acumulados reales cuando existan variables de BSD:

```bash
node src/top-scorers/render-top-scorers.js --matchday 2 --out outputs/generated/top-scorers-jornada-2.webp
```

Preparar candidatos antes del cierre de jornada:

```bash
npm run top-scorers:prep -- --matchday 2 --force
```

Generar un retrato con el preset fijo de Higgsfield:

```bash
npm run portrait:higgsfield -- --input ./referencia.png --player-key bsd-12345
```

## Datos Esperados

```json
{
  "competition": {
    "phase": "TABLA DE GOLEO",
    "matchdayNumber": "2"
  },
  "leaders": [
    {
      "name": "MESSI",
      "country": "ARGENTINA",
      "goals": 4,
      "flag": "../figma_match_card/assets/flags/ar.svg",
      "portrait": "https://..."
    }
  ]
}
```

## Assets

Este template reutiliza fuentes, banderas, logo y fondo desde `work/templates/figma_match_card/assets`.

Los retratos aprobados de jugadores viven en Supabase Storage:

```text
player-assets/portraits/{playerKey}/approved-hero.webp
player-assets/portraits/{playerKey}/manifest.json
```

El encuadre aprobado debe priorizar cara y cuello, con muy poco hombro si hace falta. No debe verse la playera como elemento principal del recorte.

Si un retrato no existe, el template muestra fallback visual y el pipeline marca al jugador como pendiente.

## Automatizacion

- Jornada 2 se publica al terminar todos los partidos del 2026-06-23.
- Jornada 3 se publica al terminar todos los partidos del 2026-06-27.
- El worker empieza a preparar candidatos desde que inicia la jornada.
- `TOP_SCORERS_PREP_CANDIDATE_LIMIT` controla cuantos jugadores probables se adelantan.
- `TOP_SCORERS_PORTRAIT_GENERATION_ENABLED=true` activa Higgsfield en produccion.
- `TOP_SCORERS_X_ENABLED=false` desactiva solo la publicacion de esta tabla en X.
- En Railway, Higgsfield debe autenticarse con variables, no con el archivo local de la Mac. La opcion mas estable es `HIGGSFIELD_CREDENTIALS_JSON` con el JSON de credenciales; como alternativa, usar `HIGGSFIELD_ACCESS_TOKEN` y opcionalmente `HIGGSFIELD_REFRESH_TOKEN`.

El render final nunca debe esperar a investigar todos los retratos desde cero. Al cierre de jornada solo recalcula posiciones, reutiliza retratos aprobados y procesa cambios de ultima hora.
