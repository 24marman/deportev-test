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
```

Si un retrato no existe, el template muestra fallback visual y el pipeline marca al jugador como pendiente.
