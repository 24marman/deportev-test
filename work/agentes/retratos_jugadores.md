# Agente: Retratos de Jugadores

## Rol

Crear, aprobar y reutilizar retratos estilizados de jugadores para templates visuales del Mundial 2026.

Este agente no arma el diseño completo. Su responsabilidad es entregar un asset visual listo para que otros templates lo usen sin volver a buscar ni procesar la foto.

## Objetivo

Mantener una biblioteca persistente de retratos aprobados por jugador, con consistencia visual, buena identificación del rostro y carga rápida en producción.

La regla clave es: la IA puede ayudar a crear la versión estilizada una vez, pero el render automático de un post debe reutilizar el asset aprobado. No debe depender de una generación nueva en el momento de publicar.

## Flujo

1. Recibe identidad del jugador desde BSD: `playerId`, nombre y selección.
2. Normaliza la identidad en un `playerKey` estable.
3. Busca si ya existe `approved-hero.webp` en Supabase Storage.
4. Si existe, lo devuelve inmediatamente.
5. Si no existe, crea o actualiza `manifest.json` con estado `pending`.
6. Construye una lista de posibles fuentes visuales.
7. Prioriza fuentes oficiales o controladas: FIFA, federación, club, API contratada, asset entregado manualmente o banco autorizado.
8. Elige la mejor foto fuente con estos criterios:
   - rostro visible y reconocible,
   - buena resolución,
   - iluminación suficiente,
   - ángulo frontal o tres cuartos,
   - cuello visible,
   - mínimo de jersey/hombros,
   - composición suficientemente cerrada para llenar el alto del rectángulo,
   - sin manos, logos grandes u objetos tapando la cara.
9. Detecta rostro y recorta con perfil `face-neck-tight`.
10. Orienta la imagen hacia el look del template:
    - si el jugador ya mira hacia la izquierda, se conserva;
    - si mira hacia la derecha, se permite espejo horizontal para composición, porque la playera no debe ser protagonista;
    - si el espejo hace que el rostro se vea raro, se conserva la orientación original.
11. Procesa la imagen al estilo aprobado:
    - blanco y negro,
    - alto contraste,
    - grano/grunge,
    - textura editorial,
    - fondo limpio o transparente si el template lo requiere,
    - identidad y rasgos reconocibles.
12. Genera preview para aprobación.
13. Una vez aprobado, guarda `approved-hero.webp`.
14. El render de producción reutiliza ese WebP sin volver a buscar ni generar.

## Uso de IA

La IA debe usarse como una etapa de estilización y refinamiento, no como sustituto libre de la identidad del jugador.

Prompt base operativo:

```text
Convert this player portrait into a black-and-white editorial grunge sports portrait.
Preserve the player's facial identity, proportions, expression, and recognizable features.
Use a tight crop focused on face and neck, with minimal shoulders and no visible jersey emphasis.
High contrast, textured grain, desaturated, dramatic but realistic.
Face should fit the approved template framing and look slightly turned toward the left when possible.
Do not invent logos, text, accessories, tattoos, badges, or facial features.
```

Si la IA altera rasgos, edad, pelo, barba, mirada o forma de la cara, el resultado se rechaza.

## Ubicación de Assets

```text
player-assets/
  portraits/
    {playerKey}/
      source.jpg
      approved-hero.webp
      manifest.json
```

`source.jpg` puede omitirse si la licencia de la fuente no permite almacenarla. En ese caso `manifest.json` conserva URL, proveedor, fecha y notas.

## Reglas

- Preferir foto oficial o de buena calidad.
- Guardar siempre metadata de fuente y estado de aprobación.
- No deformar rasgos, escudos ni elementos importantes.
- No reprocesar jugadores ya aprobados.
- El render del template no debe fallar si el retrato todavía no existe.
- La IA puede usarse como etapa de estilización, pero no como fuente principal de identidad.
- Si no existe retrato aprobado, el template usa placeholder y reporta el faltante.
- La foto final debe mostrar pura cara, cuello y muy poco hombro.
- La playera no debe ser protagonista visual del retrato.
- El retrato debe llenar verticalmente el rectángulo del template sin aire arriba ni abajo.
- Es aceptable cortar un poco cabello o parte superior de cabeza si mejora el llenado del bloque.
- La salida aprobada debe pesar poco y servirse como `.webp`.
- El asset aprobado vive en Supabase, no en la computadora local.

## QA Visual

Antes de aprobar:

- El jugador se reconoce claramente.
- La cara no parece generada desde cero.
- El recorte no muestra torso ni playera dominante.
- El retrato llena el alto del renglón sin espacios vacíos visibles.
- El tamaño funciona dentro del rectángulo del template.
- El grunge no tapa ojos, nariz ni boca.
- El contraste funciona sobre el fondo oscuro.
- El estilo coincide con los retratos ya aprobados.
- El archivo final carga desde URL pública de Supabase.

## Versionado

Cada manifest debe guardar:

- jugador,
- selección,
- fuente de imagen,
- proveedor o URL,
- fecha de actualización,
- versión de procesamiento,
- perfil de recorte,
- orientación,
- encuadre,
- estado de aprobación.

Versión vigente: `portrait-face-grunge-v2`.

## Estados

- `pending`: jugador detectado, falta fuente o procesamiento.
- `candidate`: ya existe una propuesta visual, falta aprobación.
- `approved`: asset listo para producción.
- `rejected`: fuente o resultado descartado.
- `needs-review`: el asset existe pero necesita revisión humana.

## Entrega a Otros Agentes

El agente devuelve:

```json
{
  "approved": true,
  "playerKey": "bsd-12345",
  "hero": "https://.../player-assets/portraits/bsd-12345/approved-hero.webp",
  "manifest": "https://.../manifest.json"
}
```

Si no hay asset aprobado, devuelve `approved: false` con la razón para que el template use placeholder sin romper la publicación.
