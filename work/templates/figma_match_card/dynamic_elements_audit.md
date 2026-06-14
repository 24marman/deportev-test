# Auditoria De Elementos Dinamicos

## Objetivo

Definir que partes del template vienen del diseno fijo y que partes deben cambiar automaticamente con datos del partido.

Esta auditoria sirve como puente entre Figma, el renderizador y el futuro bot de publicacion.

## Estados

- Fijo: no cambia entre renders normales.
- Dinamico: cambia segun el partido.
- Configurable: no cambia por partido necesariamente, pero puede cambiar por marca, torneo, idioma o variante.

## Matriz

| Elemento | Ubicacion visual | Tipo | Fuente de dato | Notas de implementacion |
|---|---|---:|---|---|
| Imagen del estadio | Fondo de estadio detras de toda la card | V2 | `match.venue.image` | En V1 se mantiene fijo para probar el sistema. En V2 cambiara segun sede/partido. La posicion, crop, opacidad y tratamiento son fijos del template. |
| Luces superiores | Brillos de reflectores en la parte superior | Fijo | Asset/capa `lights` de Figma | En el nuevo diseno las luces vienen como capa separada y fija. No cambian por estadio. |
| Texturas / overlays | Textura oscura, glow verde inferior, integracion visual | Fijo | CSS/assets | No estan en data. Se aplican encima del estadio para mantener consistencia. |
| Logo mundial | Parte superior, centrado sobre Copa Mundial 2026 | Fijo | `assets/worldcup-logo.svg` | Si cambia torneo o branding, hacerlo configurable. |
| Titulo torneo | Texto Copa Mundial 2026 | Fijo V1 | `competition.name`, `competition.year` | En V1 se queda como texto fijo del torneo. Puede hacerse configurable despues. |
| Fase | Texto principal Fase de grupos | Fijo V1 | `competition.phase` | En este template inicial se queda fijo como `FASE DE GRUPOS`. |
| Grupo | Subtitulo izquierdo | Dinamico parcial | `competition.groupLetter` | La palabra `GRUPO` es fija. Solo cambia la letra, por ejemplo `B`. |
| Jornada | Subtitulo derecho | Dinamico parcial | `competition.matchdayNumber` | La palabra `JORNADA` es fija. Solo cambia el numero, por ejemplo `1`. |
| Separadores del subtitulo | Lineas verdes y punto entre grupo/jornada | Fijo | SVG assets + markup | `subtitle-left.svg`, `subtitle-right.svg` y bullet fijo. |
| Equipos | Nombres sobre cada bandera | Dinamico | `teams.home.name`, `teams.away.name` | Parametrizados. Hay ajuste basico de tamano para nombres largos. |
| Banderas / escudos | Circulos izquierdo y derecho bajo los nombres | Dinamico | `teams.home.flag`, `teams.away.flag` | El template soporta imagen por equipo. |
| Marco de banderas | Aro verde/negro alrededor de cada bandera | Fijo | `assets/flag-border.svg` | No cambia por equipo. |
| Marcador | Centro de la card, numeros grandes | Dinamico | `teams.home.score`, `teams.away.score` | Parametrizado. El guion central verde es fijo. |
| Status del partido | Encima del marcador | Dinamico | `match.status` | Puede ser FINAL, EN VIVO, HT, etc. |
| Goleadores | Debajo del marcador, dos columnas | Dinamico | `events.homeScorers`, `events.awayScorers` | Renderiza filas con minuto verde `00'` y jugador. Soporta gol normal, penal y autogol. No debe recortar goles; si un jugador marca varias veces, agrupa sus minutos en una sola fila. |
| Separador de goleadores | Linea vertical verde entre columnas | Dinamico visual | CSS + altura de listas | No es altura fija. Crece o se encoge segun la lista visible de anotadores. |
| Venue name | Parte inferior, sobre logo publisher | Dinamico | `match.venue.name` | Parametrizado. Siempre va en verde. El icono de estadio es fijo. |
| Icono de estadio | Encima del venue name | Fijo | `assets/stadium-icon.svg` | No cambia por venue. |
| Publisher logo | Abajo, centrado | Fijo | `assets/deportev-logo.svg` | Si se necesita multi-publisher, volverlo configurable. |

## Resumen

Los datos deportivos principales estan preparados como dinamicos:

- Letra del grupo.
- Numero de jornada.
- Equipos.
- Banderas.
- Marcador.
- Status.
- Goleadores.
- Venue.

La imagen del estadio queda para V2.

Lo fijo por ahora:

- Torneo.
- Fase.
- Fondo del estadio para V1.
- Tratamiento visual.
- Overlays.
- Luces.
- Textura.
- Marcos.
- Separadores.
- Logo mundial.
- Icono de estadio.
- Logo publisher.

## Reglas Para Goleadores

Cada evento de gol debe poder incluir:

```json
{
  "minute": "73'",
  "player": "JUGADOR UNO",
  "goalType": "penalty"
}
```

Valores permitidos:

- Sin `goalType`: gol normal.
- `penalty`: mostrar `(P)`.
- `ownGoal`: mostrar `(AG)`.

Regla visual:

- Lado izquierdo: `JUGADOR UNO (P) 73'`.
- Lado derecho: `73' (P) JUGADOR UNO`.
- Los minutos quedan cerca de la linea central.

La etiqueta debe quedar siempre junto al nombre, nunca separada del bloque del jugador.

Reglas de layout:

- La linea verde central mide solamente la altura de la lista de anotadores.
- La primera fila del lado izquierdo y derecho debe quedar alineada arriba en la misma linea.
- Si hay un anotador por equipo, la linea debe ser corta.
- Si un lado tiene mas anotadores que el otro, la linea crece al alto de la lista mas larga.
- Si no hay anotadores, el bloque de goleadores se oculta.
- El bloque de goleadores se mantiene centrado horizontalmente debajo del marcador.
- El conjunto visual de paises, banderas, marcador y goleadores debe mantenerse centrado aunque cambie la cantidad de anotadores.
- El conjunto visual de paises, banderas, marcador y goleadores debe centrarse verticalmente entre el bloque de titulo y el icono del estadio despues de cargar los datos.
