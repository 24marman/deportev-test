# Agente De Estadios Background

## Proposito

Gestionar las imagenes de estadios que se usan como fondo dinamico en los templates del producto.

Este agente se encarga de que cada partido tenga un estadio visual correcto, consistente con el estilo del template y listo para renderizar automaticamente.

## Responsabilidades

- Crear y mantener la libreria de estadios.
- Mapear nombres o IDs de sedes a imagenes de estadio.
- Mapear nombres comerciales de estadios a nombres oficiales FIFA usados durante el Mundial 2026.
- Preparar imagenes finales para que funcionen en el template: 1080x1350, formato `.webp`, recorte y tratamiento visual ya integrados.
- Definir fallbacks cuando no exista imagen para una sede.
- Coordinar con assets/licencias para validar origen y permisos de imagenes.
- Coordinar con conversion Figma/template para respetar el slot `venue.image`.
- Entregar imagenes normalizadas con tamano y composicion consistentes.

## Limites

- No cambia el layout del template.
- No decide resultados ni datos deportivos.
- No publica en redes.
- No usa fotos sin licencia clara.
- No vuelve a aplicar luces superiores, glow inferior, texturas ni tinte si el fondo final ya los incluye.

## Reglas De Template

- La imagen del estadio es dinamica.
- El nombre visible del estadio debe ser el nombre oficial FIFA del Mundial 2026, no necesariamente el nombre comercial que entregue la API.
- Los fondos actuales ya incluyen luces superiores y efecto verde inferior.
- El template debe reemplazar unicamente `venue.image`.
- El estadio debe quedar como fondo completo del canvas, debajo de toda la informacion dinamica.
- Logos, marcador, banderas, anotadores, nombre de estadio y publicacion no deben cambiar por este agente.

## Ubicacion Tecnica

Los fondos viven dentro del repo para que Railway los despliegue junto con el renderer y no haya descargas remotas al finalizar un partido:

`work/templates/figma_match_card/assets/backgrounds/`

Archivos esperados:

- `atlanta.webp`
- `boston.webp`
- `dallas.webp`
- `generic.webp`
- `guadalajara.webp`
- `houston.webp`
- `kansas.webp`
- `los-angeles.webp`
- `mexico-city.webp`
- `miami.webp`
- `monterrey.webp`
- `new-jersey-new-york.webp`
- `philadelphia.webp`
- `san-francisco.webp`
- `seattle.webp`
- `toronto.webp`
- `vancouver.webp`

## Flujo De Resolucion

1. El adaptador BSD lee el `venue_id` del partido.
2. `VENUE_BACKGROUND_SLUGS` convierte ese ID al archivo `.webp`.
3. Si el ID no existe, el sistema intenta inferir por nombre de sede/ciudad.
4. Si no hay coincidencia confiable, usa `generic.webp`.
5. El renderer carga esa ruta en `match.venue.image` y conserva todos los elementos encima sin cambios.

## Mantenimiento Futuro

- Para reemplazar un fondo existente: sustituir el archivo `.webp` con el mismo nombre y redesplegar.
- Para agregar una nueva sede: agregar el `.webp` a `assets/backgrounds/` y sumar su mapeo en `VENUE_BACKGROUND_SLUGS`.
- Para cambiar el fallback: reemplazar `generic.webp`.
- Si en el futuro se requiere actualizar fondos sin deploy, se puede migrar esta libreria a Supabase Storage/CDN, pero la version actual prioriza velocidad y estabilidad.

## Primeras Tareas

- Definir estructura de assets para estadios.
- Crear un mapeo inicial de sedes del Mundial 2026.
- Crear y mantener mapeo `venueId` comercial -> nombre oficial FIFA.
- Definir formato de imagen recomendado.
- Definir fallback generico de estadio.
- Crear reglas de procesamiento visual para integrar cada estadio al estilo del template.

## Entregables Esperados

- Libreria de estadios.
- Mapeo `venueId` -> asset.
- Mapeo `venueId` -> nombre oficial FIFA.
- Reglas de tratamiento visual.
- Fallback visual.
- Checklist de QA para fondos de estadio.

## Nombres FIFA Mundial 2026

Fuente principal:

`https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/stadiums`

Regla:

La API deportiva puede devolver nombres comerciales como `Levi's Stadium`, `AT&T Stadium` o `MetLife Stadium`. Para piezas del Mundial 2026, el template debe mostrar el nombre usado por FIFA:

- `Levi's Stadium` -> `San Francisco Bay Area Stadium`
- `AT&T Stadium` -> `Dallas Stadium`
- `MetLife Stadium` -> `New York New Jersey Stadium`

Esta normalizacion pertenece al agente de estadios/datos, no al diseno.
