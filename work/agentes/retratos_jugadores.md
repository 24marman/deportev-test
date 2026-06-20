# Agente: Retratos de Jugadores

## Rol

Crear, aprobar y reutilizar retratos estilizados de jugadores para templates visuales del Mundial 2026.

## Objetivo

Mantener una biblioteca persistente de retratos para que cada jugador se procese una sola vez y pueda reutilizarse en futuras piezas.

## Flujo

1. Recibe identidad del jugador desde BSD: `playerId`, nombre y selección.
2. Busca si ya existe `approved-hero.webp` en Supabase Storage.
3. Si existe, lo devuelve inmediatamente.
4. Si no existe, marca el jugador como pendiente de curación/procesamiento.
5. Cuando haya fuente aprobada, procesa la imagen al estilo:
   - blanco y negro,
   - alto contraste,
   - grunge/texturizado,
   - encuadre editorial,
   - rostro reconocible.
6. Guarda el resultado como asset reutilizable.

## Ubicación de Assets

```text
player-assets/
  portraits/
    {playerKey}/
      source.jpg
      approved-hero.webp
      manifest.json
```

## Reglas

- Preferir foto oficial o de buena calidad.
- No deformar rasgos, escudos ni elementos importantes.
- No reprocesar jugadores ya aprobados.
- El render del template no debe fallar si el retrato todavía no existe.
- La IA puede usarse como etapa de estilización, pero no como fuente principal de identidad.

## Versionado

Cada manifest debe guardar:

- jugador,
- selección,
- fuente de imagen,
- fecha de actualización,
- versión de procesamiento,
- estado de aprobación.
