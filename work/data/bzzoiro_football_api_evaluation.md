# Evaluacion API BSD Football - Mundial 2026

Docs: `https://sports.bzzoiro.com/docs/football/`

Schema local: `work/data/football-schema.json`

## Veredicto Inicial

Esta API si parece candidata para alimentar nuestro producto.

Tiene endpoints para:

- Partidos y resultados.
- Eventos en vivo.
- Incidentes del partido.
- Equipos.
- Sedes/estadios.
- Standings/grupos.
- Squads del Mundial 2026.
- Lineups, stats y metadata opcional.

## Requisito

La API requiere token.

Prueba realizada:

- `GET https://sports.bzzoiro.com/api/v2/events/`
- Resultado: `401`
- Header: `www-authenticate: Token`

Esto significa que necesitamos una API key desde:

`https://sports.bzzoiro.com/register/`

## Prueba Con API Key

Estado: exitosa.

Identificadores confirmados:

- Mundial 2026: `league_id=27`.
- Temporada Mundial 2026: `season_id=188`.
- Partido de prueba: `event_id=8292`.

Partido probado:

- Qatar 1-1 Switzerland.
- Grupo B.
- Jornada 1.
- Estadio: Levi's Stadium.
- Status: `finished`.

Endpoints usados:

- `/api/v2/leagues/?include_inactive=true&limit=200`
- `/api/v2/events/?league_id=27&season_id=188&limit=5`
- `/api/v2/events/?league_id=27&season_id=188&date_from=2026-06-11&date_to=2026-06-20&limit=10`
- `/api/v2/events/8292/`
- `/api/v2/events/8292/incidents/`
- `/api/v2/venues/{venue_id}/`

Campos confirmados para V1:

- Equipos reales.
- Marcador final.
- Grupo.
- Jornada.
- Venue ID.
- Nombre de estadio.
- Incidentes de goles.
- Minuto del gol.
- Added time, por ejemplo `90+5'`.
- Jugador del gol.
- Lado local/visitante con `is_home`.
- Penal con `goal_type: "penalty"`.

Adaptador local:

`work/tools/bsd_match_adapter.js`

JSON generado para el template:

`work/templates/figma_match_card/data/current-match.json`

El template carga automaticamente este JSON si existe.

## Endpoints V1 Que Nos Sirven

### Buscar partidos

`GET /api/v2/events/`

Filtros utiles:

- `date_from`
- `date_to`
- `league_id`
- `season_id`
- `status`
- `team_id`
- `team_name`

Campos utiles del evento:

- `id`
- `league_id`
- `season_id`
- `home_team`
- `away_team`
- `home_team_id`
- `away_team_id`
- `venue_id`
- `event_date`
- `status`
- `round_number`
- `round_name`
- `group_name`
- `current_minute`
- `home_score`
- `away_score`
- `penalty_shootout`
- `extra_time_score`

### Detalle de partido

`GET /api/v2/events/{id}/`

Sirve para confirmar el score final, grupo, estadio y estado del partido.

### Goles e incidentes

`GET /api/v2/events/{id}/incidents/`

Este endpoint es critico para nuestro template porque de aqui deberian salir:

- Goles.
- Minuto.
- Jugador.
- Penal.
- Autogol.
- Equipo del gol.

Pendiente: probar shape real con API key, porque el schema no documenta el cuerpo de respuesta.

### Partidos en vivo

`GET /api/v2/events/live/`

Sirve para monitoreo automatico durante partidos. Tiene cache de 30 segundos.

### Tabla/grupos

`GET /api/v2/leagues/{id}/standings/?season_id={season_id}`

Sirve para futuras plantillas de tabla de grupo.

### Estadios del Mundial

`GET /api/v2/leagues/{id}/seasons/{season_id}/venues/`

La doc dice que reemplaza el endpoint legacy `/api/worldcup/venues/` para FIFA World Cup 2026.

Campos de venue:

- `id`
- `name`
- `city`
- `country`
- `country_code`
- `capacity`
- `latitude`
- `longitude`

### Squads Mundial 2026

`GET /api/v2/worldcup/squads/`

Filtros utiles:

- `group`
- `team_id`
- `has_player`

Sirve para futuras piezas de convocatorias/jugadores, no necesariamente para el marcador final V1.

## Mapeo A Nuestro Template V1

| Template | Campo BSD API | Campo Nuestro |
| --- | --- | --- |
| Letra de grupo | `event.group_name` | `competition.groupLetter` |
| Jornada | `event.round_number` o logica propia | `competition.matchdayNumber` |
| Equipo local | `event.home_team` | `teams.home.name` |
| Equipo visitante | `event.away_team` | `teams.away.name` |
| Score local | `event.home_score` | `teams.home.score` |
| Score visitante | `event.away_score` | `teams.away.score` |
| Estado | `event.status` | `match.status` |
| Estadio | `event.venue_id` + `/venues/{id}/` | `match.venue.name` |
| Bandera local | `home_team` -> resolver ISO propio | `teams.home.flag` |
| Bandera visitante | `away_team` -> resolver ISO propio | `teams.away.flag` |
| Goleadores | `/events/{id}/incidents/` | `events.homeScorers`, `events.awayScorers` |

## Riesgos

- Necesitamos API key.
- Hay que validar que el Mundial 2026 exista en `leagues` y obtener su `league_id` y `season_id`.
- El endpoint de incidentes no trae schema documentado; hay que probar la respuesta real.
- Banderas no deberian depender de la API: mejor resolverlas con nuestro agente de selecciones/assets.
- Fondo de estadio queda para V2; V1 solo usa nombre del estadio.

## Siguiente Paso

Cuando tengamos API key:

1. Ampliar el mapa de banderas para las 48 selecciones.
2. Probar un partido con autogol para confirmar el valor exacto de `goal_type`.
3. Crear seleccion automatica del ultimo partido terminado del Mundial.
4. Crear polling para detectar cuando un partido cambia a `finished`.
5. Conectar el render PNG despues de cada actualizacion valida.
