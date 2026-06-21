# Agente: Retratos de Jugadores

## Rol

Crear, aprobar y reutilizar retratos estilizados de jugadores para templates visuales del Mundial 2026.

Este agente no arma el diseño completo. Su responsabilidad es entregar un asset visual listo para que otros templates lo usen sin volver a buscar ni procesar la foto.

Cuando necesita crear un nuevo candidato visual, primero delega la busqueda de referencia al agente `fuentes_retratos_jugadores.md` y despues delega la regeneración al agente `regeneracion_retratos_ia.md`. El proveedor de produccion para la tabla de goleadores es Higgsfield con el preset fijo `top-scorers-bw-grunge-v1`. La prioridad es preservar la cara de la imagen de entrada; si la IA inventa otra cara, el candidato se rechaza.

## Objetivo

Mantener una biblioteca persistente de retratos generados por IA y aprobados por jugador, con consistencia visual, buena identificación del rostro, fondo removido y carga rápida en producción.

La regla clave es: la IA genera el retrato una vez, se aprueba, se guarda y el render automático reutiliza el asset aprobado. El bot no debe generar rostros en caliente al momento de publicar.

## Flujo

1. Recibe identidad del jugador desde BSD: `playerId`, nombre y selección.
2. Normaliza la identidad en un `playerKey` estable.
3. Busca si ya existe `approved-hero.webp` en Supabase Storage.
4. Si existe, lo devuelve inmediatamente.
5. Si no existe, crea o actualiza `manifest.json` con estado `pending`.
6. Investiga referencias visuales actuales con `fuentes_retratos_jugadores.md` solo para construir un perfil del jugador:
   - peinado actual,
   - barba/bigote,
   - edad visual,
   - rasgos reconocibles,
   - expresión probable,
   - look de selección o torneo.
   Fuentes preferidas: Guardian Player Guide por nombre/seleccion y FotMob por `playerId`.
7. No modifica directamente la foto encontrada en internet. La referencia sirve para entender cómo se ve el jugador, no como asset final.
8. En produccion genera un candidato con Higgsfield usando el preset bloqueado. El modo `preserve` queda como laboratorio/fallback local para comparar identidad o rescatar un asset urgente.
9. La generación debe pedir:
    - close-up extremo de cara y cuello,
    - casi nada de hombro,
    - sin torso,
    - blanco y negro,
    - alto contraste,
    - grano/grunge muy fuerte,
    - textura editorial rayada,
    - rostro y cuello dominantes,
    - mirada/orientación hacia la izquierda cuando funcione,
    - fondo plano `#00ff00` para recorte por chroma,
    - sin logos, texto, escudos inventados ni playera protagonista.
10. Remueve el fondo verde con `removeChromaAndApplyGrunge` y guarda una salida con alpha.
11. Ajusta el asset al contrato del template: retrato alto, cara/cuello, sin aire vertical.
12. Genera preview para aprobación.
13. Una vez aprobado, guarda `approved-hero.webp`.
14. El render de producción reutiliza ese WebP sin volver a buscar ni generar.

## Uso de IA

La IA es la fuente del retrato final. Internet solo se usa para obtener una referencia visual clara, salvo que el proyecto entregue una referencia aprobada.

Preset vigente de produccion:

```text
top-scorers-bw-grunge-v1
```

Ese preset exige el mismo blanco y negro, brillo, contraste, sombras, grano, textura, nitidez, encuadre y fondo para todos los jugadores. El objetivo no es que cada jugador "salga bonito", sino que todos parezcan producidos en la misma sesion editorial.

Prompt base operativo:

```text
Preserve the exact face, facial geometry, hair, beard, expression and angle from the input image.
Do not invent a new person. Do not make the face generic.
Transform it into a black-and-white editorial grunge football portrait.
Close crop on face and neck only, with at most a tiny amount of shoulder.
No jersey emphasis, no visible badges, no text and no logos.
The face must fill the frame vertically and may crop a little hair if needed.
Use a perfectly flat solid #00ff00 chroma-key background.
High contrast, harsh grain, scratched texture, dirty printed sports poster feel.
Face turned slightly toward the left when possible.
No watermark, no second person, no clean studio look, no distorted facial features.
```

Si la IA altera rasgos, edad, pelo, barba, mirada o forma de la cara, el resultado se rechaza.

Si el output se ve como otra persona, aunque el grunge sea correcto, se rechaza.

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
- No aprobar una cara inventada cuando existe una referencia clara del jugador.
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
- El retrato se parece a la imagen de entrada usada para aprobarlo.
- La cara no parece falsa, deformada ni genérica.
- El recorte no muestra torso ni playera dominante.
- El retrato llena el alto del renglón sin espacios vacíos visibles.
- El tamaño funciona dentro del rectángulo del template.
- La pose y expresión no se repiten de forma idéntica en todos los jugadores.
- La textura grunge aparece en la cara, no solo en el fondo.
- El fondo verde original era uniforme y removible.
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

Versión vigente: `top-scorers-bw-grunge-v1`.

## Estados

- `pending`: jugador detectado, falta fuente o procesamiento.
- `reference-ready`: ya existe referencia de Guardian, falta generacion Higgsfield.
- `candidate`: ya existe una propuesta visual, falta aprobación.
- `approved`: asset listo para producción.
- `higgsfield-failed`: hubo referencia, pero fallo la generacion IA.
- `generated-local`: se genero WebP local, pero no se pudo subir a Supabase.
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
