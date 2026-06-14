# Auditoria De Auto Layout - Marcador Final

Fuente Figma: `TEST2`, nodo `7:2562`

Objetivo: asegurar que el template renderizable no sea solo una copia visual estatica, sino que respete la estructura de layout del diseno para poder cambiar datos automaticamente sin romper la composicion.

## Regla Principal

Si en Figma un bloque usa Auto Layout, en el template debe existir un equivalente estructural:

- Auto Layout horizontal -> `display: flex; flex-direction: row` o `grid` cuando haya columnas controladas.
- Auto Layout vertical -> `display: flex; flex-direction: column`.
- Gap de Figma -> `gap` en CSS.
- Padding de Figma -> `padding` en CSS.
- Hug contents -> tamano basado en contenido.
- Fill container -> crecimiento controlado dentro del padre.
- Fixed size -> ancho/alto fijo con limites claros.

## Bloques A Auditar

| Bloque | Funcion | Debe respetar |
| --- | --- | --- |
| Header completo | Logo, torneo, titulo, grupo/jornada | Alineacion centrada, stack vertical, gaps, tracking |
| Subtitle | Linea izquierda, texto, linea derecha | Layout horizontal centrado, gap estable, lineas no deformadas |
| Scoreboard | Equipo local, score, equipo visitante | Grid/columnas fijas, centro estable, simetria |
| Equipo | Nombre + bandera | Stack vertical, bandera centrada, mascara estable |
| Flag component | Imagen de bandera + borde/mask | Mascara, escala `cover`, borde encima, sin deformacion |
| Score | Estado + marcador | Centro absoluto, score no cambia posicion con digitos |
| Scorers | Goleadores local + divisor + visitante | Columnas, gap, alineacion izquierda/derecha, altura basada en contenido |
| Venue | Icono + nombre estadio | Stack vertical centrado, blend mode `exclusion` |
| Publisher logo | Logo Deportev | Proporcion original, sin stretch |

## Pruebas Dinamicas Obligatorias

Antes de aprobar este template, el agente debe probar:

- Equipo corto: `QATAR`.
- Equipo largo: `ESTADOS UNIDOS`.
- Score corto: `0-1`.
- Score amplio: `10-9`.
- Sin goleadores.
- Muchos goleadores.
- Un goleador por equipo: la linea verde debe ser corta y medir la altura real de esa fila.
- Distinta cantidad por lado: la linea verde debe crecer al alto de la columna mas larga.
- Distinta cantidad por lado: la primera fila de ambos lados debe arrancar en la misma linea superior.
- Estadio largo: `SAN FRANCISCO BAY AREA STADIUM`.
- Estadio mas largo que una linea normal.

## Reglas Especificas Del Bloque De Marcador

- El bloque desde nombres de paises hasta goleadores debe mantenerse centrado horizontalmente.
- El bloque desde nombres de paises hasta goleadores debe centrarse verticalmente entre la tercera linea del titulo y el icono del estadio.
- Las columnas de equipo local, marcador y equipo visitante deben conservar simetria aunque cambien nombres o scores.
- El bloque de goleadores no debe reservar altura fija.
- Las columnas de goleadores se alinean arriba, no centradas verticalmente de forma independiente.
- Las filas de goleadores de izquierda y derecha deben tener el mismo ancho y estar centradas como bloque. En la version actual se amplio el espacio contra Figma para legibilidad: fila 235px, nombre 179px, minuto 44px y gap interno 12px.
- El espacio entre cada columna de goleadores y la linea central debe ser corto; los minutos quedan cerca de la linea.
- Los nombres de goleadores no deben truncarse con tres puntos; deben ajustar tamano si es necesario.
- La linea verde central entre goleadores debe medir solamente la altura de la lista visible.
- Si hay un anotador por equipo, la linea debe ser corta.
- Si hay varios anotadores, la linea debe crecer con la columna mas alta.
- Si no hay anotadores, el bloque de goleadores debe ocultarse sin mover el marcador fuera de centro.
- El centrado vertical debe recalcularse despues de renderizar datos, porque la altura de goleadores cambia segun el partido.

## Pendientes Detectados

- Extraer del nodo Figma las propiedades exactas de Auto Layout donde esten disponibles.
- Comparar cada bloque contra `styles.css`.
- Reemplazar posicionamiento manual por `flex/grid` en los bloques donde Figma use Auto Layout y el CSS actual sea demasiado absoluto.
- Revisar que los textos dinamicos tengan ancho maximo y overflow controlado.
- Revisar que las banderas usen la mascara exacta del componente de Figma, no solo `border-radius: 50%`.

## Criterio De Aprobacion

El template se considera fiel cuando:

- El screenshot local coincide visualmente con Figma.
- Las propiedades estructurales principales coinciden con Auto Layout.
- Los datos dinamicos pueden cambiar sin mover o romper bloques vecinos.
- No existen assets aplastados, recortados accidentalmente o fuera de mascara.
