# Delegacion 001: Prueba De Procesamiento Visual

## Orquestador

El Orquestador no ejecuta la transformacion visual. Su responsabilidad es definir la tarea, asignarla al agente especialista, recibir el entregable y decidir el siguiente paso con el usuario.

## Agente Asignado

Agente De Procesamiento Visual.

## Solicitud Del Usuario

El usuario entrega una foto y quiere que el agente:

- Encuadre bien la imagen en formato 1:1.
- Convierta la imagen a blanco y negro.
- Aplique estilo grunge.
- Conserve en color solamente la playera, respetando el color original de la foto.

## Foto De Prueba

Archivo original:

`/var/folders/5p/vqtj0dw924jbwx71ndd0nqk80000gn/T/codex-clipboard-8512388b-6ff2-42fb-af76-0c68d90e09e7.png`

## Entregable Esperado Del Agente

- Analisis de la foto.
- Receta visual recomendada.
- Prompt operativo para generar la imagen.
- Criterios de QA.
- Riesgos y fallbacks para esta foto concreta.

## Resultado Del Agente

El Agente De Procesamiento Visual valido que la foto es adecuada para la prueba. Recomienda:

- Recorte 1:1 desde el lado derecho-centro de la imagen.
- Jugador principal grande, con rostro, torso, puños y playera visibles.
- Blanco y negro de alto contraste para todo excepto la playera verde del jugador principal.
- Verde original preservado, sin saturarlo artificialmente.
- Textura grunge editorial: grano, polvo, rayas sutiles, sombras fuertes y viñeta ligera.
- Desaturar completamente al jugador secundario y el fondo para que no compitan.

## Prompt Operativo Del Agente

```text
Transform the provided soccer photograph into a square 1:1 editorial grunge sports portrait. Crop tightly around the main Mexican player wearing number 9, keeping his face, torso, both clenched fists, and the green jersey clearly visible. Convert the entire image to gritty high-contrast black and white, with visible film grain, subtle dust, scratches, rough editorial texture, and a slight vignette.

Preserve in full original color only the green jersey of the main foreground player. Keep the jersey's natural Mexico green tone, realistic fabric texture, shadows, folds, number, crest, and pattern details. Everything else must be black and white: skin, face, arms, shorts, crowd, stadium, referee, and the background player, including that background player's green jersey. Make the result dramatic, sharp, cinematic, and suitable for a sports magazine cover or poster. Do not add text, logos, borders, or extra graphic elements.
```

## QA Propuesto

- La imagen final debe ser exactamente cuadrada 1:1.
- El jugador principal debe seguir siendo el foco claro.
- La playera verde del jugador principal debe conservar color natural.
- Ninguna otra zona verde debe quedar coloreada.
- Rostro, brazos, fondo, shorts y estadio deben quedar en blanco y negro.
- No debe haber halos verdes alrededor de brazos, cuello, rostro o fondo.
- El escudo, numero y textura de camiseta deben seguir legibles.

## Riesgos Detectados

- El jugador del fondo tambien tiene camiseta verde y puede quedar coloreado por accidente.
- Puede haber sangrado verde en bordes de brazos y cuello.
- Un crop muy cerrado puede cortar puños o cabeza.
- El grunge excesivo puede ensuciar el rostro.
- El verde puede sobresaturarse si no se respeta el color original.

## Estado

Completado por el Agente De Procesamiento Visual.
