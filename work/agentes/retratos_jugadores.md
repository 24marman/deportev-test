# Agente: Retratos de Jugadores

## Rol

Crear, aprobar y reutilizar retratos estilizados de jugadores para templates visuales del Mundial 2026.

Este agente no arma el diseño completo. Su responsabilidad es entregar un asset visual listo para que otros templates lo usen sin volver a buscar ni procesar la foto.

## Objetivo

Mantener una biblioteca persistente de retratos generados por IA y aprobados por jugador, con consistencia visual, buena identificación del rostro, fondo removido y carga rápida en producción.

La regla clave es: la IA genera el retrato una vez, se aprueba, se guarda y el render automático reutiliza el asset aprobado. El bot no debe generar rostros en caliente al momento de publicar.

## Flujo

1. Recibe identidad del jugador desde BSD: `playerId`, nombre y selección.
2. Normaliza la identidad en un `playerKey` estable.
3. Busca si ya existe `approved-hero.webp` en Supabase Storage.
4. Si existe, lo devuelve inmediatamente.
5. Si no existe, crea o actualiza `manifest.json` con estado `pending`.
6. Investiga referencias visuales actuales solo para construir un perfil del jugador:
   - peinado actual,
   - barba/bigote,
   - edad visual,
   - rasgos reconocibles,
   - expresión probable,
   - look de selección o torneo.
7. No modifica directamente la foto encontrada en internet. La referencia sirve para entender cómo se ve el jugador, no como asset final.
8. Genera un retrato nuevo con IA usando el perfil visual del jugador y, si existe, referencias aprobadas por el proyecto.
9. La generación debe pedir:
    - blanco y negro,
    - alto contraste,
    - grano/grunge,
    - textura editorial,
    - rostro y cuello dominantes,
    - muy poco hombro,
    - mirada/orientación hacia la izquierda cuando funcione,
    - fondo plano removible o transparencia nativa,
    - sin logos, texto, escudos inventados ni playera protagonista.
10. Remueve el fondo y guarda una salida con alpha.
11. Ajusta el asset al contrato del template: retrato alto, cara/cuello, sin aire vertical.
12. Genera preview para aprobación.
13. Una vez aprobado, guarda `approved-hero.webp`.
14. El render de producción reutiliza ese WebP sin volver a buscar ni generar.

## Uso de IA

La IA es la fuente del retrato final. Internet solo se usa para scouting visual, salvo que el proyecto entregue una referencia aprobada.

Prompt base operativo:

```text
Generate an original black-and-white editorial grunge sports portrait of {playerName}
based on current visual references: {hair}, {beard}, {ageVisual}, {faceTraits}.
Close crop on face and neck, minimal shoulders, no jersey emphasis.
The portrait should feel like a modern football tournament graphic.
High contrast, gritty grain, desaturated, dramatic but realistic.
Face turned slightly toward the left when possible.
Use a perfectly flat chroma-key background or native transparency for background removal.
No text, no watermark, no invented logos, no badges, no distorted facial features.
```

Si la IA altera rasgos, edad, pelo, barba, mirada o forma de la cara, el resultado se rechaza.

Si el proveedor de IA no permite generar un jugador específico por nombre o likeness, el agente no debe inventar una cara genérica y fingir que es ese jugador. Debe marcar el asset como `needs-ai-provider` o `needs-approved-reference`.

## Ubicación de Assets

```text
player-assets/
  portraits/
    {playerKey}/
      generated-source.png
      approved-hero.webp
      manifest.json
```

`manifest.json` debe conservar el perfil visual usado, proveedor IA, prompt, fecha, estado de aprobación y notas de QA. Las referencias web usadas para scouting pueden guardarse como URLs/notas, pero no son el asset final.

## Reglas

- Usar referencias actuales solo para entender el look del jugador.
- Guardar siempre metadata de fuente y estado de aprobación.
- No modificar una foto encontrada en internet como solución final.
- No deformar rasgos ni inventar detalles importantes.
- No reprocesar jugadores ya aprobados.
- El render del template no debe fallar si el retrato todavía no existe.
- La IA debe generar el retrato final o trabajar desde una referencia aprobada por el proyecto.
- Si no existe retrato aprobado, el template usa placeholder y reporta el faltante.
- La foto final debe mostrar pura cara, cuello y muy poco hombro.
- La playera no debe ser protagonista visual del retrato.
- El retrato debe llenar verticalmente el rectángulo del template sin aire arriba ni abajo.
- Es aceptable cortar un poco cabello o parte superior de cabeza si mejora el llenado del bloque.
- La salida aprobada debe pesar poco y servirse como `.webp`.
- El asset aprobado vive en Supabase, no en la computadora local.
- Nunca publicar un retrato genérico como si fuera un jugador real.

## QA Visual

Antes de aprobar:

- El jugador se reconoce claramente.
- La cara no parece falsa, deformada ni genérica.
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
- `needs-ai-provider`: el generador disponible no permite crear esa likeness.
- `needs-approved-reference`: se requiere referencia aprobada por el proyecto para generar sin inventar una cara.

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
