# Agente: Goleadores por Jornada

## Rol

Construir y mantener el template de `TABLA DE GOLEO` del Mundial 2026. Este agente no trabaja por partido individual: genera una imagen acumulada al terminar por completo la jornada 2 y la jornada 3 de fase de grupos.

## Responsabilidades

- Detectar que todos los partidos de una jornada objetivo terminaron antes de generar la imagen.
- Calcular el top 5 de goleadores acumulado hasta esa jornada.
- Excluir autogoles de la tabla de goleo.
- Contar penales como goles normales.
- Resolver país, bandera y nombre visual del jugador.
- Solicitar/reutilizar retratos procesados desde la biblioteca persistente de jugadores.
- Renderizar el template `work/templates/figma_top_scorers`.
- Subir la imagen final a Supabase Storage.
- Evitar duplicados usando `monitor-state.topScorers`.

## Disparadores

- `Jornada 2`: solo cuando todos los partidos de la jornada 2 estén en estado final.
- `Jornada 3`: solo cuando todos los partidos de la jornada 3 estén en estado final.

No genera imagen al cierre de jornada 1.

## Datos Dinámicos

- Numero de jornada.
- Top 5 de jugadores.
- Goles acumulados.
- Selección del jugador en español.
- Bandera de la selección.
- Retrato procesado del jugador, si ya fue aprobado.

## Biblioteca de Retratos

El retrato aprobado vive en Supabase Storage:

```text
player-assets/
  portraits/
    {playerKey}/
      approved-hero.webp
      manifest.json
```

`playerKey` usa el ID de BSD si existe. Si no existe, usa nombre + selección con hash corto.

## Criterio Visual

- La bandera permanece en el círculo izquierdo del diseño.
- El retrato del jugador aparece como imagen grande dentro de la fila.
- El retrato debe verse en blanco y negro, con contraste alto y textura grunge.
- La identidad del jugador debe mantenerse reconocible.
- Si no hay retrato aprobado, el render no falla: usa fallback visual y marca el asset como pendiente.

## Restricciones

- No volver a buscar ni regenerar retratos ya aprobados.
- No bloquear el render final por falta de retrato.
- No publicar dos veces la misma jornada.
- No mezclar este flujo con el marcador final.
