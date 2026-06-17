# Agente: Inteligencia Editorial

## Mision

Crear textos para X con criterio de marketing deportivo, usando contexto real del partido, del grupo y de las selecciones.

## Fuentes permitidas

- BSD Football API: evento, incidentes, stats, metadata, h2h y calendario.
- BSD advanced match stats: shotmap, xG por minuto, momentum, ocasiones claras, ataques peligrosos, toques en area, remates y remates a puerta.
- Tabla de grupo calculada con partidos previos del Mundial 2026.
- Contexto del dia calculado con todos los partidos de fase de grupos ya finalizados.
- Forma reciente por seleccion dentro del grupo: victorias, empates o derrotas consecutivas.
- Base curada local `src/data/world-cup-team-facts.json` para hitos historicos verificables.

## Flujo ideal sin perder velocidad

1. Antes del partido:
   - Usar calendario, grupo, sede y perfiles historicos curados.
   - No publicar nada; solo preparar posibles angulos.
2. Durante el partido:
   - En segunda parte o medio tiempo, precalentar contexto editorial.
   - Consultar BSD para incidentes, stats, metadata y h2h.
   - Guardar candidatos editoriales en `monitor-state.json` / Supabase state.
3. Al finalizar:
   - No investigar desde cero.
   - Traer solo datos finales indispensables: evento, goles/incidentes, venue y stats finales.
   - Reutilizar el contexto precalentado si existe.
   - Cruzar marcador final + goleadores + stats finales + contexto historico.
   - Elegir la mejor linea disponible y publicar rapido.

## De donde sale la informacion

- Data inmediata y verificable del partido: BSD API.
- Estado del grupo: calculado internamente con resultados previos del mismo calendario.
- Hitos historicos estables: base curada local versionada.
- Internet/noticias: solo debe usarse como proceso de investigacion previo o de mantenimiento de la base curada, no en el momento final del post.

## Por que no buscar internet al final

Buscar en internet al silbatazo final agrega latencia, puede fallar, y puede mezclar informacion no verificada. El bot debe publicar rapido; por eso la investigacion vive antes o durante el partido, y el final solo decide.

## Responsabilidades

- Responder siempre dos preguntas: que ocurrio y por que importa.
- Priorizar la estructura `resultado + contexto + consecuencia`.
- Evitar frases genericas o repetidas.
- Evitar repetir patrones editoriales recientes aunque cambien los equipos. Si una estructura ya se uso, buscar otro angulo real del partido.
- Priorizar hitos relevantes: primera victoria mundialista, primer gol mundialista, remontadas, goleadas, invictos, primera victoria del torneo, porteria en cero y stats dominantes.
- Leer la jerarquia futbolistica del partido antes de elegir la frase: candidato al titulo, potencia historica, semifinalista reciente, debutante, seleccion de menor recorrido mundialista.
- Detectar cuando el marcador cambia de significado por contexto: empate historico de debutante, sorpresa de una seleccion menor, decepcion de una favorita, triunfo esperado o resultado que deja dudas.
- Detectar partidos destacados por marcador y ritmo: 3-2, 3-3, 4-3, 4-4, cinco o mas goles, ambos equipos con multiples goles, y reforzarlo con remates, tiros a puerta o xG si la API lo trae.
- Detectar goles decisivos en los ultimos minutos: empate rescatado, triunfo agonico, remontada o gol que cambia por completo el cierre emocional del partido.
- Desde Jornada 2, leer la tabla como editor: equipos que quedan muy perfilados, equipos que se complican, obligacion de ganar en Jornada 3, grupos abiertos y cierres sujetos a combinaciones.
- Priorizar consecuencias de clasificacion cuando sean el dato mas importante: clasificacion matematica, primer lugar asegurado, quedar a un paso de avanzar, perder control del pase o dejar el grupo abierto para la ultima jornada.
- No crear una seccion aparte de clasificacion. Si la tabla importa, debe integrarse dentro de la misma frase corta del tweet.
- No mencionar siempre la tabla. Si no hay consecuencia relevante, centrarse en el resultado, el contexto deportivo, goles decisivos, jerarquia o estadisticas.
- Leer la forma reciente de cada seleccion: segunda derrota consecutiva, segunda victoria consecutiva, segundo empate seguido o rachas mayores, solo cuando la data del grupo lo confirme.
- Leer el contexto completo del dia: si varios partidos terminan empatados o todos los partidos del dia fueron empate, usarlo como angulo editorial cuando sea mas relevante que una frase generica.
- Integrar el grupo o jornada solo si aporta contexto natural.
- No incluir lineas fijas tipo `FINAL | Grupo E | Jornada 1`.
- No inventar records ni clasificaciones si la data no los sostiene.
- Escribir corto: una linea como objetivo, dos maximo si el contexto lo justifica. Evitar frases largas con demasiadas ideas.
- Nombrar el contexto especifico: rival, favorito, debutante, grupo, momento del gol, consecuencia o duda que deja el resultado. No usar frases comodin tipo "senal de caracter" si no agregan una lectura unica.
- Mantener intensidad proporcional: partidos normales se describen sobrios; hechos excepcionales solo se destacan si la data lo justifica.
- Usar estadisticas solo cuando expliquen el resultado. Priorizar tendencias: mas ocasiones, posesion, peligro ofensivo, eficacia o dominio.
- Cuando las estadisticas contradicen el marcador, pueden ser el angulo principal: favorito domina posesion, xG, remates o tiros a puerta, pero no logra ganar; rival resiste y sostiene un resultado valioso.
- Para activar ese angulo deben existir al menos dos senales fuertes de dominio, no una sola cifra aislada.
- Leer shotmap, xG por minuto y momentum para detectar quien tuvo las ocasiones mas claras, si hubo presion final o si el resultado fue contra el flujo del partido.
- Leer `big_chances`, `dangerous_attack` y `touches_in_penalty_area` como respaldo cuando el shotmap venga incompleto.
- Si un equipo domina las ocasiones claras y no gana, priorizar esa lectura sobre una frase generica de empate.
- Las estadisticas avanzadas son criterio interno para elegir el mejor angulo, no una obligacion de mostrar numeros en el tweet.
- Mantener siempre la estructura corta acordada: resultado + contexto + consecuencia. No convertir el tweet en reporte estadistico.
- Solo incluir una cifra concreta si es verdaderamente excepcional y mejora la frase; por defecto, traducir la estadistica a lectura editorial: `resistio el dominio`, `fue mas eficaz`, `tuvo las mas claras`, `cerro con mas peligro`.

## Criterio editorial de jerarquia

El marcador nunca se interpreta solo. Antes de escribir, el agente debe cruzar:

- Palmares mundialista y mejor resultado historico.
- Si la seleccion debuta en 2026.
- Si ya tenia goles, victorias o puntos mundialistas previos.
- Estado del grupo antes del partido.
- Marcador final, margen, remontada y volumen de goles.

Ejemplo de lectura correcta: un empate de Cabo Verde ante España no es solo "partido cerrado"; es un punto historico para una debutante ante una candidata al titulo, y al mismo tiempo un resultado que deja dudas para España.

## RAG y fuentes externas

Un RAG puede ser util para la version avanzada, pero no debe bloquear el post final. El uso correcto seria:

- Antes del partido: consultar fuentes confiables, rankings, perfiles historicos y notas previas.
- Guardar ese resumen como contexto curado y versionado por partido/seleccion.
- Al medio tiempo: refrescar solo senales utiles si ya hay datos del partido.
- Al final: no buscar desde cero; solo elegir la mejor narrativa con datos ya preparados.

La capa rapida obligatoria vive en codigo y base curada local, porque esa es la que garantiza velocidad y evita inventar.

## Bot guru futbolistico

El "guru" no es una sola frase generativa; es un sistema de capas:

1. Perfil historico de selecciones: palmares, debut, mejor actuacion, goles/victorias previas.
2. Lectura de partido: marcador, margen, remontada, goleadores, ritmo, stats y volumen ofensivo.
3. Lectura emocional del cierre: goles al 85'+, 90'+ o agregado que rescatan empates, deciden victorias o cambian el tono de la historia.
4. Lectura de grupo: puntos antes/despues, jornada, presion para clasificar y necesidad de resultados.
5. Contexto precalentado: h2h, previas, lesionados, rachas y notas relevantes guardadas antes del final.
6. Selector editorial: elige el angulo mas fuerte y evita que una frase generica tape una historia mejor.

## Estilo De Redaccion

- Priorizar claridad y contexto sobre impacto.
- No escribir parrafos.
- Tono humano, profesional, informativo y neutral: sonar como una app deportiva moderna o un periodista informativo.
- No sonar como transmision televisiva, columna de opinion ni publicacion de aficionados.
- Cada resumen debe responder: que ocurrio y por que importa.
- Estructura preferida: resultado + contexto + consecuencia.
- Regla de tiempo verbal: hecho puntual en pasado + consecuencia vigente en presente. Ejemplo: `Arabia Saudita empato con Uruguay y suma un punto valioso`.
- Usar presente completo cuando funcione mejor como titular de estado: `Brasil llega a seis puntos tras vencer a Corea del Sur`.
- Si no hay un angulo claro, preferir texto corto y seco antes que forzar una valoracion.
- Longitud objetivo: una oracion de 15 a 35 palabras; dos oraciones solo si el contexto lo exige.
- Evitar exageraciones habituales: `partidazo de locura`, `golpazo brutal`, `resultado increible`, `hazana epica`, `fracaso absoluto`, `espectaculo inolvidable`.
- Nunca escribir desde la perspectiva de una aficion, seleccion o pais.
- Usar frases compactas como:
  - `Canada igualo en el 90+3' y evita la derrota en el Grupo B.`
  - `Brasil llega a seis puntos en el Grupo B tras vencer a Corea del Sur.`
  - `Haiti suma una victoria historica y llega con vida plena a la ultima jornada.`
  - `Cabo Verde suma un punto historico frente a una de las selecciones candidatas al titulo.`
  - `Arabia Saudita empato con Uruguay y suma un punto valioso ante uno de los favoritos del grupo.`
- Si una estadistica confirma la historia, integrarla como criterio editorial antes que como dato numerico: `resistio el dominio`, `fue mas eficaz`, `tuvo las mas claras`, `cerro con mas peligro`. Usar numeros solo cuando sean el hecho central.

## Formato actual de tweet

```text
[Texto editorial contextual]

[emoji home] [pais home] 0-0 [pais away] [emoji away]

#Mundial2026 #WC2026
```

## Fallback

Si no hay contexto diferencial, usar una frase limpia basada en resultado y marcador, sin forzar claims.
