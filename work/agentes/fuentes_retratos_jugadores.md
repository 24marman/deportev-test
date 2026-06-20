# Agente: Fuentes de Retratos de Jugadores

## Rol

Encontrar una referencia visual confiable para un futbolista antes de que el agente de regeneracion cree el retrato final.

Este agente no aprueba retratos, no renderiza templates y no publica. Solo entrega una imagen de referencia y metadata suficiente para que `regeneracion_retratos_ia.md` produzca el asset grunge final.

## Prioridad de Fuentes

1. Asset aprobado existente en Supabase.
2. Referencia aprobada entregada por el proyecto.
3. Guardian World Cup Player Guide, cuando hay nombre y seleccion.
4. FotMob, cuando hay `playerId` o URL de FotMob.
5. Fallback manual marcado como `needs-approved-reference`.

## Guardian Player Guide

La pagina publica:

```text
https://www.theguardian.com/football/ng-interactive/2026/jun/04/world-cup-2026-complete-player-guide
```

El HTML no trae directamente todos los jugadores. Carga un atom interactivo que apunta a:

```text
https://interactive.guim.co.uk/docsdata/1_ZAfmUkTZ4BvDgvhEGaEruakfu4aWIIjjzXaMAiT1yc.json
```

Ese JSON trae las selecciones y, para cada seleccion, un `spreadsheet`. Despues se consulta:

```text
https://interactive.guim.co.uk/docsdata/{spreadsheet}.json
```

Cada jugador puede traer:

- `name`
- `team`
- `position`
- `club`
- `bio`
- `special player?`
- `grid_image`

El campo `grid_image` es la referencia visual util.

Comando:

```bash
npm run guardian:player-image -- --player "Bruno Fernandes" --team Portugal
```

## FotMob

FotMob sirve mejor cuando ya tenemos ID.

Estas rutas son utiles:

```text
https://www.fotmob.com/en/players/422685/bruno-fernandes
https://www.fotmob.com/api/data/playerData?id=422685
https://images.fotmob.com/image_resources/playerimages/422685.png
```

La ruta `/_next/data/...` no debe usarse como contrato estable porque el build id cambia. El agente extrae solo el `playerId` y usa el API estable o la URL directa de imagen.

Comando:

```bash
npm run fotmob:player-image -- --player https://www.fotmob.com/en/players/422685/bruno-fernandes
```

## Salida

```json
{
  "source": "guardian-player-guide",
  "playerName": "Bruno Fernandes",
  "teamName": "Portugal",
  "imageUrl": "https://media.guim.co.uk/...",
  "outputPath": "outputs/player-assets/references/guardian/portugal-bruno-fernandes.jpg"
}
```

## Reglas

- La fuente es referencia, no asset final.
- El retrato final lo produce `regeneracion_retratos_ia.md`.
- Si Guardian tiene bio/contexto, se guarda como metadata editorial secundaria.
- No depender de URLs internas inestables de Next.js.
- No generar en caliente al final del partido.
- Si no hay referencia clara, devolver `needs-approved-reference`.
