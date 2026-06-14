# Evaluacion API football-data.org - Mundial 2026

Endpoint probado:

`https://api.football-data.org/v4/matches`

Docs:

- `https://www.football-data.org/documentation/quickstart`
- `https://www.football-data.org/documentation/api`

## Veredicto Inicial

Esta API tambien es candidata, especialmente para:

- Calendario.
- Partidos.
- Marcador.
- Equipos.
- Competicion FIFA World Cup.
- Goleadores basicos, si el endpoint de match trae `goals`.

Pero parece menos completa que BSD para nuestro caso si necesitamos:

- Venue real del partido Mundial 2026.
- Incidentes detallados.
- Confirmar penal/autogol con total confianza.
- Datos especificos de sedes del Mundial.

## Prueba Realizada

`GET https://api.football-data.org/v4/matches`

Respuesta sin API key:

```json
{
  "filters": {
    "dateFrom": "2026-06-13",
    "dateTo": "2026-06-14",
    "permission": null
  },
  "resultSet": {
    "count": 0
  },
  "matches": []
}
```

Conclusion:

- El endpoint responde sin token en esta prueba.
- No habia partidos disponibles en la ventana por defecto.
- Puede tener limites de permiso, rate limit o cobertura segun endpoint.

## Competicion Mundial

La documentacion identifica:

- FIFA World Cup
- `id`: `2000`
- `code`: `WC`
- `type`: `CUP`

Endpoint recomendado para Mundial:

`GET /v4/competitions/WC/matches`

Filtros utiles:

- `dateFrom`
- `dateTo`
- `stage`
- `status`
- `matchday`
- `group`
- `season`

## Campos Potencialmente Utiles

Segun la documentacion de partidos, puede traer:

- `homeTeam`
- `awayTeam`
- `score`
- `status`
- `stage`
- `group`
- `matchday`
- `goals`
- `penalties`
- `bookings`
- `substitutions`

Ejemplo documentado de `goals`:

- `minute`
- `injuryTime`
- `type`
- `team`
- `scorer`
- `assist`
- `score`

Esto puede alimentar:

- Score local/visitante.
- Goleador.
- Minuto.
- Equipo del gol.

## Dudas Importantes

- Confirmar si `type` en `goals` distingue `REGULAR`, `PENALTY`, `OWN_GOAL` o nombres equivalentes.
- Confirmar si el endpoint del Mundial 2026 incluye `venue` real del partido. La documentacion de teams trae `venue`, pero eso puede ser sede del equipo, no sede neutral del Mundial.
- Confirmar si para Mundial 2026 el calendario esta completo y actualizado.
- Confirmar si todos los endpoints requeridos funcionan sin token o si necesitaremos `X-Auth-Token`.

## Mapeo A Nuestro Template V1

| Template | football-data.org | Campo Nuestro |
| --- | --- | --- |
| Letra de grupo | `match.group` | `competition.groupLetter` |
| Jornada | `match.matchday` | `competition.matchdayNumber` |
| Equipo local | `match.homeTeam.name` | `teams.home.name` |
| Equipo visitante | `match.awayTeam.name` | `teams.away.name` |
| Score local | `match.score.fullTime.home` | `teams.home.score` |
| Score visitante | `match.score.fullTime.away` | `teams.away.score` |
| Estado | `match.status` | `match.status` |
| Goleadores | `match.goals` | `events.homeScorers`, `events.awayScorers` |
| Penal/autogol | `goal.type` si existe | `goalType` |
| Banderas | resolver interno | `teams.home.flag`, `teams.away.flag` |
| Estadio | pendiente validar | `match.venue.name` |

## Comparacion Rapida Contra BSD

| Necesidad | football-data.org | BSD Football API |
| --- | --- | --- |
| Fixtures/resultados | Si | Si |
| Mundial por codigo/id | Si, `WC` / `2000` | Probable via `leagues` |
| Goles por partido | Probable via `goals` | Probable via `incidents` |
| Penal/autogol | Pendiente confirmar | Pendiente confirmar |
| Estadios Mundial 2026 | Pendiente | Endpoint especifico de venues por liga/season |
| Squads Mundial 2026 | No visto | Si, `/worldcup/squads/` |
| Live polling | Posible | Si, endpoint live con cache 30s |
| Token | Puede requerir segun endpoint/plan | Requiere token |

## Recomendacion

Usarla como fuente alternativa o respaldo.

Para V1 puede ser suficiente si confirma:

- Partidos del Mundial 2026.
- Score final.
- `goals` con minuto/jugador/equipo.
- Tipo de gol para penal/autogol.

Pero si necesitamos sedes exactas, squads del Mundial y mas detalle de live/incidentes, BSD parece mas completa.
