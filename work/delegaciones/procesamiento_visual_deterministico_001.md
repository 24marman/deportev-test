# Delegacion 002: Edicion Deterministica De Jersey

## Orquestador

El usuario corrigio el enfoque: no quiere regeneracion de imagen porque deforma escudos, numeros, letras y detalles del uniforme. El Orquestador debe asegurar que el Agente De Procesamiento Visual trabaje con edicion sobre pixeles originales.

## Agente Asignado

Agente De Procesamiento Visual.

## Regla Principal

No usar generacion de imagen para este flujo. El agente debe hacer edicion deterministica:

- Crop 1:1.
- Blanco y negro.
- Mascara de playera.
- Composicion del color original de la foto.
- Textura grunge procedural.

## Archivos Entregados Por El Agente

- `work/tools/jersey_filter.py`
- `outputs/prueba_grunge_playera_color_deterministica_v1.png`

## Evaluacion Del Orquestador

La direccion tecnica es correcta porque preserva pixeles originales y evita deformar escudos, letras y numeros.

La primera salida todavia necesita ajuste:

- La mascara conserva bien parte superior de la playera.
- El escudo, parche y numero se preservan desde la foto original.
- La parte inferior del jersey pierde demasiado color verde.
- La textura grunge procedural se ve demasiado pixelada/cuadrada.
- El borde de la mascara necesita limpieza mas fina.

## Siguiente Iteracion Recomendada

- Mejorar la mascara del jersey para recuperar verdes oscuros.
- Restringir la mascara al torso del jugador principal.
- Suavizar bordes sin crear halos.
- Cambiar el grunge de bloques cuadrados a grano, polvo y rayas mas naturales.
- Mantener la prohibicion de regeneracion generativa.

## Iteracion V2

El Agente De Procesamiento Visual genero:

- `outputs/prueba_grunge_playera_color_deterministica_v2.png`

Comando reportado:

```bash
python3 work/tools/jersey_filter.py /var/folders/5p/vqtj0dw924jbwx71ndd0nqk80000gn/T/codex-clipboard-8512388b-6ff2-42fb-af76-0c68d90e09e7.png outputs/prueba_grunge_playera_color_deterministica_v2.png
```

Resultado:

- Crop 1:1 verificado en 1980 x 1980.
- Textura grunge mejorada: ruido fino, polvo y rayas en vez de bloques cuadrados.
- Escudo, letras, numero y patrones se preservan porque vienen de pixeles originales.
- Fondo y jugador secundario permanecen en blanco y negro.
- La mascara aun requiere una iteracion para recuperar mejor el verde oscuro del jersey inferior.

## Estado

Prueba V2 completada. Pendiente una tercera iteracion de mascara si el usuario aprueba seguir refinando.

## Iteracion V3 Encargada

El usuario aprobo el adelanto, pero observo que la playera no queda coloreada suficientemente bien. El Orquestador delego una V3 al Agente De Procesamiento Visual con foco exclusivo en mejorar la mascara del jersey.

Objetivo de V3:

- Conservar mucho mas color real en toda la playera.
- Recuperar verdes oscuros y zona inferior del uniforme.
- Mantener fondo, brazos, cara, cancha y jugador secundario en blanco y negro.
- No cambiar el principio tecnico: cero regeneracion generativa.

Estrategia solicitada:

- Ventana anatomica del torso.
- Semillas verdes confiables.
- Expansion por conectividad dentro del torso.
- Inclusion controlada de zonas oscuras del uniforme.
- Exclusion explicita de piel, brazos y fondo.

## Resultado V3

La V3 no fue aceptable. La mascara genero una franja horizontal artificial sobre el pecho y perdio la forma organica de la playera.

Aprendizaje:

- La expansion libre o rectangular degrada el resultado.
- La mascara debe mantenerse anatomica y conectada a la forma real del uniforme.
- No basta con recuperar color; tambien hay que evitar artefactos geometricos.

## Resultado V4

El agente corrigio el enfoque hacia una V4 mas conservadora y genero:

- `outputs/prueba_grunge_playera_color_deterministica_v4.png`
- `outputs/prueba_grunge_playera_mask_v4.png`

Resultado observado:

- Recupera mucho mas color real de la playera.
- Mantiene el principio correcto de preservar pixeles originales.
- Conserva escudo, numero y patrones sin deformacion generativa.
- No es aceptable todavia como salida final porque contamina zonas fuera de la playera y genera un bloque/artefacto rectangular visible.

Decision del Orquestador:

La V4 demuestra que se puede recuperar mas jersey, pero la estrategia necesita una mascara mas limpia. La siguiente iteracion no debe expandir por rectangulos; debe construir una mascara anatomica o usar una segmentacion que detecte prenda/torso sin redibujar la foto.

## Iteracion V5 Encargada

El usuario propuso una direccion mas precisa: localizar primero el color real de la playera y usar ese perfil para conservarla en color.

Objetivo de V5:

- Muestrear una zona segura del jersey.
- Detectar tonos verdes claros, medios y oscuros reales de la foto.
- Crear mascara por perfil de color, no por expansion rectangular.
- Restringir la mascara al torso del jugador principal.
- Preservar pixeles originales del jersey.
- Mantener fondo, brazos, cara y jugador secundario en blanco y negro.

Entregables solicitados:

- `outputs/prueba_grunge_playera_color_deterministica_v5.png`
- `outputs/prueba_grunge_playera_mask_v5.png`
- `outputs/prueba_grunge_playera_color_profile_v5.txt` si aplica.

## Resultado V5/V6

La V5 probo perfil de color del jersey. El perfil detectado fue util:

- Verde oscuro aproximado: RGB (3, 46, 38).
- Verde medio aproximado: RGB (3, 63, 50).
- Verde claro aproximado: RGB (8, 91, 74).

La V5 recupero color, pero mantuvo artefactos geometricos y contaminacion.

La V6 limpio el bloque rectangular principal y redujo contaminacion, pero perdio demasiado color en la parte inferior oscura de la playera.

Conclusion:

- Localizar el color real ayuda.
- El problema principal no es solo color; es geometria de mascara.
- Para un resultado confiable, el agente necesita una etapa de segmentacion de prenda/persona que produzca una mascara, sin regenerar la imagen final.
- La composicion final debe seguir siendo deterministica con pixeles originales.
