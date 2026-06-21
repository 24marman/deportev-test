# Agente: Goleadores por Jornada

## Rol

Construir y mantener el template de `TABLA DE GOLEO` del Mundial 2026. Este agente no trabaja por partido individual: genera una imagen acumulada al terminar por completo la jornada 2 y la jornada 3 de fase de grupos.

## Responsabilidades

- Detectar que todos los partidos de una jornada objetivo terminaron antes de generar la imagen.
- Calcular el top 5 de goleadores acumulado hasta esa jornada.
- Antes del cierre, preparar candidatos probables del top 5 para reducir tiempo de publicacion.
- Excluir autogoles de la tabla de goleo.
- Contar penales como goles normales.
- Resolver país, bandera y nombre visual del jugador.
- Solicitar/reutilizar retratos procesados desde la biblioteca persistente de jugadores.
- Renderizar el template `work/templates/figma_top_scorers`.
- Subir la imagen final a Supabase Storage.
- Publicar la imagen final en X cuando `X_POST_MODE=auto`.
- Evitar duplicados usando `monitor-state.topScorers`.
- Evitar reprocesos usando `monitor-state.topScorersPrep`.

## Disparadores

- `Jornada 2`: solo cuando todos los partidos de la jornada 2 estén en estado final.
- `Jornada 3`: solo cuando todos los partidos de la jornada 3 estén en estado final.

No genera imagen al cierre de jornada 1.

## Calendario Operativo

- `Jornada 2`: inicia el 2026-06-18 y termina el 2026-06-23.
- `Jornada 3`: inicia el 2026-06-24 y termina el 2026-06-27.

Durante esas ventanas el worker consulta BSD, calcula candidatos acumulados y adelanta retratos. Al terminar el ultimo partido de la jornada, vuelve a calcular el top 5 definitivo y solo procesa cambios de ultima hora.

## Prewarm de Candidatos

El prewarm se ejecuta con `prepareTopScorersMatchday`:

1. Consulta todos los partidos acumulados hasta la jornada objetivo.
2. Calcula candidatos probables con `TOP_SCORERS_PREP_CANDIDATE_LIMIT` (default: 8).
3. Para cada jugador revisa si ya existe `approved-hero.webp` en Supabase.
4. Si existe, lo reutiliza.
5. Si no existe, descarga referencia desde Guardian Player Guide.
6. Si `TOP_SCORERS_PORTRAIT_GENERATION_ENABLED=true`, procesa la referencia con Higgsfield usando el preset bloqueado `top-scorers-bw-grunge-v1`.
7. Guarda el retrato aprobado en Supabase con `playerId`/`playerKey`.
8. Registra estado y errores en `monitor-state.topScorersPrep`.

Si Guardian o Higgsfield fallan para un jugador, el agente espera `TOP_SCORERS_PORTRAIT_RETRY_MINUTES` antes de reintentar para no gastar ciclos innecesarios.

Comando manual:

```bash
npm run top-scorers:prep -- --matchday 2 --force
```

Prueba sin generar ni descargar:

```bash
npm run top-scorers:prep -- --matchday 2 --dry-run --force
```

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

La biblioteca no vive en la computadora local en produccion. Los archivos locales dentro de `outputs/player-assets/portraits` son cache de trabajo; la fuente estable para el bot es Supabase Storage.

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
- No generar retratos por primera vez en el ultimo segundo si se pudieron precalentar durante la jornada.
