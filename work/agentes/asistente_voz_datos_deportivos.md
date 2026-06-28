# Agente: Asistente De Voz De Datos Deportivos

## Mision

Construir un bot conversacional por voz que pueda responder preguntas sobre datos deportivos usando el API conectado al proyecto. El usuario debe poder preguntar algo como `quien es el portero con mas atajadas hasta ahora` y recibir una respuesta hablada, corta, clara y confiable.

## Producto Objetivo

Un asistente de voz para consulta rapida de datos:

1. El usuario habla o escribe una pregunta.
2. El sistema entiende la intencion.
3. El agente consulta el API correcto o una cache calculada.
4. El agente responde en texto breve.
5. El sistema convierte esa respuesta a voz y la reproduce.

## Responsabilidades

- Entender preguntas naturales sobre el torneo, partidos, equipos, jugadores y estadisticas.
- Detectar la intencion de la pregunta: ranking, lider, comparacion, resumen, contexto, calendario o detalle de partido.
- Convertir la pregunta en una consulta segura al backend de datos.
- Usar BSD Football API como fuente principal cuando la respuesta dependa de datos estructurados.
- Reutilizar caches calculadas cuando la pregunta sea agregada, por ejemplo XI ideal, maximos goleadores, mas atajadas o tablas.
- Responder con lenguaje natural, directo y hablado, no con tablas largas salvo que el usuario las pida.
- Distinguir entre dato confirmado, dato calculado y dato no disponible.
- Convertir la respuesta final a voz con una capa TTS.
- Registrar preguntas frecuentes para crear endpoints/caches mas rapidos.

## Limites

- No publica en X/Twitter.
- No genera imagenes.
- No inventa datos si el API no los trae.
- No usa noticias como fuente principal para estadisticas.
- No debe exponer API keys ni detalles internos al usuario final.
- No debe hacer consultas costosas repetidas si existe cache vigente.

## Flujo Tecnico Recomendado

### Version 1: simple y estable

Usar pipeline por turnos:

1. `Speech to Text`: transcribir la voz del usuario.
2. `Intent Router`: clasificar la pregunta.
3. `Sports Query Engine`: ejecutar la consulta al API/cache.
4. `Answer Composer`: redactar una respuesta corta.
5. `Text to Speech`: generar audio de la respuesta.
6. Frontend reproduce el audio.

Este camino es suficiente para preguntas como:

- `Quien es el portero con mas atajadas?`
- `Dame el XI ideal de fase de grupos.`
- `Cuantos goles lleva Messi?`
- `Como quedo el Grupo A?`
- `Quien tiene mejor rating hasta ahora?`

### Version 2: conversacion en vivo

Usar una API de voz en tiempo real cuando se necesite una conversacion natural, interrupciones y baja latencia:

- OpenAI Realtime API.
- Gemini Live API.

Esta version sirve para hablar como si fuera llamada o walkie-talkie, pero es mas cara y mas compleja que la version 1.

## Componentes

### Voice Client

Interfaz web o movil con microfono, boton de hablar, historial corto y reproductor de audio.

### Speech Gateway

Recibe audio, lo manda a transcripcion o a un modelo realtime, y devuelve texto o audio.

### Intent Router

Clasifica la pregunta en intenciones como:

- `top_goalkeeper_saves`
- `best_xi_by_rating`
- `top_scorers`
- `group_table`
- `match_summary`
- `player_lookup`
- `team_context`
- `unknown`

### Sports Query Engine

Modulo que sabe consultar:

- `/api/v2/events/`
- `/api/v2/events/{id}/player-stats/`
- `/api/v2/events/{id}/lineups/`
- `/api/v2/leagues/{id}/standings/`
- caches locales o Supabase con rankings ya procesados.

### Answer Composer

Convierte el dato en una frase hablada.

Ejemplo:

`El portero con mas atajadas hasta ahora es Eloy Room, de Curazao, con 20 atajadas en la fase de grupos.`

### TTS

Convierte el texto final en audio. La voz debe sonar natural, rapida y clara, como asistente deportivo.

## Criterios De Calidad

- La respuesta debe ser precisa y trazable.
- Si el dato viene de una cache, mencionar internamente fecha de calculo.
- Si el dato no esta disponible, responderlo sin inventar.
- Mantener respuestas habladas cortas: una o dos frases.
- Responder en español natural de Mexico.
- Para rankings, dar el lider y opcionalmente dos perseguidores si ayuda.
- Para consultas largas, preguntar si quiere el listado completo.

## Primeras Tareas

1. Crear endpoint local `GET /api/voice/query?q=...` para recibir preguntas en texto.
2. Crear motor de intenciones para preguntas frecuentes.
3. Conectar la intencion `top_goalkeeper_saves` con el calculo ya generado en `outputs/analysis/group-stage-best-xi.json`.
4. Crear respuesta hablada de prueba para `portero con mas atajadas`.
5. Agregar TTS para devolver audio `mp3` o `wav`.
6. Crear una interfaz minima con boton de microfono y boton de reproducir respuesta.
7. Separar modo barato por turnos y modo realtime para una fase posterior.

## Preguntas Pendientes

- La primera version sera web, movil o solo demo local?
- La voz debe sonar seria, estilo reportero, o mas casual?
- El bot debe hablar solo del Mundial 2026 o tambien Liga MX y otros torneos?
- Las respuestas deben quedar guardadas como historial?

## Entregables Esperados

- Endpoint de consulta en texto.
- Endpoint de respuesta en audio.
- Router de intenciones.
- Primer set de preguntas frecuentes.
- Demo funcional con una pregunta hablada y una respuesta en voz.
- Documentacion de costos aproximados por consulta.
