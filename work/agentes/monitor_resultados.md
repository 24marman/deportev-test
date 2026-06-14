# Agente Monitor De Resultados

## Proposito

Detectar automaticamente cuando un partido del Mundial 2026 termina y disparar la generacion de imagenes sin depender de revision manual.

Este agente no publica en redes. Solo detecta finales, valida datos y avisa al renderizador.

V1 aplica solo para la plantilla de marcador final de fase de grupos. No debe generar imagenes de 16avos, octavos, cuartos, semifinales, tercer lugar ni final.

## Responsabilidades

- Mantener calendario de partidos del Mundial 2026 desde BSD API.
- Filtrar solamente partidos de fase de grupos.
- Detectar inicio del segundo tiempo.
- Contar 40 minutos desde el inicio del segundo tiempo antes de iniciar monitoreo fuerte.
- Revisar solo en ventanas utiles segun estado real del partido.
- Detectar cambios de estado: `notstarted`, `1st_half`, `halftime`, `2nd_half`, `finished`.
- Confirmar marcador final con `/api/v2/events/{id}/`.
- Confirmar goleadores con `/api/v2/events/{id}/incidents/`.
- Evitar duplicados: no generar dos imagenes para el mismo final.
- Guardar registro de partidos procesados.
- Coordinarse con Agente De Datos Mundial 2026 y Agente De Renderizado De Imagenes.

## Estrategia Recomendada V1

No hacer polling todo el dia.

Usar estado real del partido:

- Cargar calendario de fase de grupos una vez al dia.
- Ignorar cualquier partido que no tenga `group_name`.
- Ignorar cualquier partido con `round_name` de knockout.
- Antes del partido: no monitorear fuerte.
- Durante primer tiempo: no monitorear fuerte.
- En `halftime`: esperar.
- Cuando el partido entre a segundo tiempo, registrar hora de inicio del segundo tiempo.
- Desde inicio de segundo tiempo + 40 minutos: revisar cada 2 minutos.
- Cuando `status=finished`: pedir detalle + incidents, generar JSON y disparar render.
- Si el partido no termina despues de inicio de segundo tiempo + 75 minutos: bajar frecuencia a cada 5 minutos o marcar para revision.
- Despues de terminado y procesado: dejar de revisar ese partido.

## Filtro De Fase De Grupos

El agente solo procesa partidos que cumplan:

- `league_id = 27`.
- `season_id = 188`.
- `group_name` existe, por ejemplo `Group C`.
- `round_name` esta vacio o no es fase eliminatoria.
- `round_number` corresponde a jornada de grupos.

El agente no procesa:

- Round of 32 / 16avos.
- Round of 16 / octavos.
- Quarterfinals.
- Semifinals.
- Match for 3rd place.
- Final.

## Regla De Monitoreo Por Segundo Tiempo

La ventana fuerte de monitoreo no empieza por hora absoluta de kickoff, sino por estado del partido:

1. Detectar que el evento entro a `2nd_half` o periodo equivalente (`2T`, `2nd_half`).
2. Guardar `second_half_started_at`.
3. Esperar 40 minutos.
4. Desde ahi consultar `/api/v2/events/{id}/` cada 2 minutos.
5. Al detectar `status=finished`, pedir:
   - `/api/v2/events/{id}/`
   - `/api/v2/events/{id}/incidents/`
   - `/api/v2/venues/{venue_id}/`
6. Crear `matchData`.
7. Disparar render WebP.
8. Marcar `processed_at` para evitar duplicados.

## Fuente BSD

Endpoint principal para monitoreo:

`GET /api/v2/events/live/?league_id=27&season_id=188`

La documentacion indica que este endpoint:

- Lista eventos en ventana live.
- Esta pensado para dashboards con polling frecuente.
- Tiene cache Redis con TTL de 30 segundos.
- Cubre desde `event_date - 5 min` hasta aproximadamente 10 minutos despues del silbatazo final.

Endpoint de confirmacion:

`GET /api/v2/events/{id}/`

Endpoint de goleadores:

`GET /api/v2/events/{id}/incidents/`

## Costos Y Riesgos

- La estrategia evita consultar todo el dia.
- Consultar cada 2 minutos solo desde minuto 40 del segundo tiempo reduce mucho las llamadas.
- El costo real depende del plan/rate limit de BSD.
- Hay que respetar el TTL de 30 segundos: consultar mas rapido que eso normalmente no aporta.
- Si BSD ofrece websocket estable y documentado, puede evaluarse como V2.

## Entregables

- Worker monitor.
- Tabla local de partidos y estados.
- Registro de partidos procesados.
- Evento interno `match.finished` para disparar render.
- Logs claros de por que se genero o no una imagen.

## Estado Interno Minimo

Cada partido monitoreado debe guardar:

- `event_id`.
- `home_team`.
- `away_team`.
- `event_date`.
- `group_name`.
- `round_number`.
- `status`.
- `period`.
- `second_half_started_at`.
- `final_detected_at`.
- `render_started_at`.
- `render_completed_at`.
- `processed_at`.
- `last_checked_at`.
- `check_count`.

## Evento Interno

Cuando detecta final valido, emite:

```json
{
  "type": "match.finished",
  "template": "group-stage-final-score",
  "event_id": 8293,
  "league_id": 27,
  "season_id": 188
}
```

Ese evento lo recibe el Agente De Renderizado De Imagenes.
