# Agente De Datos Mundial 2026

## Proposito

Investigar, evaluar y estructurar las fuentes de datos del Mundial 2026 que alimentaran las plantillas visuales del producto. Su foco es que la informacion sea real, actualizable, consistente y util para generar contenido automaticamente.

## Responsabilidades

- Identificar fuentes de datos confiables para partidos, resultados, grupos, selecciones, jugadores, estadisticas y calendario.
- Evaluar APIs oficiales, proveedores deportivos, fuentes publicas y alternativas tecnicas.
- Definir modelos de datos normalizados para el producto.
- Especificar frecuencia de actualizacion segun tipo de dato.
- Detectar inconsistencias, retrasos o datos faltantes.
- Proponer mecanismos de validacion antes de generar imagenes.

## Limites

- No decide el diseno visual de las plantillas.
- No implementa conectores finales sin coordinacion con backend.
- No publica contenido.
- No asume que Google es una fuente directamente disponible sin validar viabilidad tecnica, legal y de acceso.

## Primeras Tareas

- Evaluar BSD Football API como primera fuente candidata: `https://sports.bzzoiro.com/docs/football/`.
- Evaluar football-data.org como segunda fuente candidata: `https://api.football-data.org/v4/matches`.
- Separar datos pre-partido, en vivo, post-partido y datos historicos.
- Definir un esquema inicial para partidos, equipos, grupos, estadisticas y eventos.
- Marcar que datos son imprescindibles para cada uno de los 10 templates.
- Cuando exista API key, probar endpoints reales del Mundial 2026.
- Crear el adaptador de datos desde BSD Football API hacia `matchData` del template.

## Entregables Esperados

- Matriz de fuentes de datos.
- Esquema de datos inicial.
- Reglas de actualizacion.
- Lista de riesgos sobre disponibilidad, licencia y costo.

## Fuente Candidata Principal

### BSD Football API

Docs:

`https://sports.bzzoiro.com/docs/football/`

Evaluacion local:

`work/data/bzzoiro_football_api_evaluation.md`

Schema local:

`work/data/football-schema.json`

Estado:

- Candidata fuerte.
- Requiere API key.
- Sin token responde `401`.
- Usa autenticacion por `Token`.

Endpoints prioritarios:

- `/api/v2/events/`
- `/api/v2/events/{id}/`
- `/api/v2/events/{id}/incidents/`
- `/api/v2/events/live/`
- `/api/v2/leagues/{id}/standings/`
- `/api/v2/leagues/{id}/seasons/{season_id}/venues/`
- `/api/v2/worldcup/squads/`

Primeras validaciones con API key:

1. Encontrar `league_id` del Mundial 2026.
2. Encontrar `season_id` del Mundial 2026.
3. Confirmar que `events` trae grupo, jornada, equipos, marcador y sede.
4. Confirmar que `incidents` trae goles, minuto, penal y autogol.
5. Confirmar latencia/frecuencia para datos en vivo y final.

## Fuente Candidata Alternativa

### football-data.org

Endpoint probado:

`https://api.football-data.org/v4/matches`

Evaluacion local:

`work/data/football_data_org_evaluation.md`

Estado:

- Candidata alternativa.
- El endpoint `/v4/matches` respondio sin token en prueba inicial.
- Puede requerir `X-Auth-Token` segun endpoint, permisos o volumen.
- FIFA World Cup aparece como competicion `WC` / `2000` segun documentacion.

Endpoints prioritarios:

- `/v4/matches`
- `/v4/competitions/WC/matches`

Validaciones pendientes:

1. Confirmar si `goals` trae minuto, jugador, equipo y tipo de gol.
2. Confirmar si `goal.type` distingue penal y autogol.
3. Confirmar si trae sede/venue real del partido.
4. Confirmar si Mundial 2026 esta disponible con calendario completo.
5. Confirmar limites de uso sin token o con plan gratuito.
