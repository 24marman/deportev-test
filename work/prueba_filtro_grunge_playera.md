# Prueba Del Filtro Grunge Con Playera A Color

## Objetivo

Validar si el agente de procesamiento visual puede transformar una foto en una imagen 1:1 con:

- Buen encuadre.
- Blanco y negro grunge.
- Playera conservada en color original.
- Resultado listo para contenido deportivo.

## Forma Mas Rapida De Probar

1. El usuario entrega una foto.
2. El agente genera una version transformada.
3. Se revisan cuatro criterios:
   - Encuadre 1:1.
   - Deteccion correcta de la playera.
   - Estilo grunge convincente.
   - Limpieza del color selectivo.
4. Se ajusta el estilo hasta encontrar una receta visual base.

## Fotos Recomendadas Para La Primera Prueba

Usar 3 tipos de foto:

- Foto facil: una persona centrada, playera de color fuerte, fondo distinto.
- Foto media: fondo con colores parecidos a la playera o varias sombras.
- Foto dificil: varias personas, playera blanca/negra, baja luz o cuerpo parcialmente tapado.

## Criterios De Aprobacion

La prueba se considera buena si:

- La imagen final se ve profesional sin ajustes manuales.
- La persona queda bien centrada.
- La playera mantiene su color real.
- El resto de la imagen no conserva colores accidentales.
- El estilo grunge se siente intencional, no como simple filtro gris.

## Posibles Resultados

### Resultado A: Funciona Bien

Se convierte en base del MVP y se construye la app con subida, preview y exportacion.

### Resultado B: Funciona Parcialmente

Se agrega una correccion simple, por ejemplo detectar mejor torso/playera o limpiar mascara.

### Resultado C: No Funciona Confiable

Se prueba un enfoque con segmentacion mas avanzada antes de construir la app.

## Siguiente Paso

El usuario debe subir una foto de prueba. Idealmente una imagen donde se vea claramente una persona con playera o jersey.
