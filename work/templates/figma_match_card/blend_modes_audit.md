# Auditoria de Blend Modes - Marcador Final

Fuente Figma: `TEST2`, nodo `7:2562`

## Mapeo Figma a CSS

| Elemento | Blend en Figma | CSS actual | Estado |
| --- | --- | --- | --- |
| Fondo estadio | Normal, opacity 70% | `.stadium-bg` opacity 0.7 | OK |
| Logo mundial | Screen | `.worldcup-logo { mix-blend-mode: screen; }` | OK |
| Glow verde principal | Color | `.green-glow { mix-blend-mode: color; }` | OK |
| Copa Mundial / 2026 | Difference | `.tournament { mix-blend-mode: difference; }` | OK |
| Fase de grupos | Difference | `.card-header h1 { mix-blend-mode: difference; }` | OK |
| Lineas decorativas subtitle | Difference | `.subtitle img { mix-blend-mode: difference; }` | OK |
| Grupo / jornada | Difference | `.subtitle p { mix-blend-mode: difference; }` | OK |
| Nombres de equipos | Difference | `.team h2 { mix-blend-mode: difference; }` | OK |
| Marco de bandera | Difference | `.flag-frame`, `.flag-border` | OK |
| Imagen/mask de bandera | Difference | `.team-flag { mix-blend-mode: difference; }` | OK |
| Estado FINAL | Difference | `.status { mix-blend-mode: difference; }` | OK |
| Marcador | Difference | `.scoreline { mix-blend-mode: difference; }` | OK |
| Goleadores | Difference | `.scorers`, `.scorer-minute`, `.scorer-name` | OK |
| Divisor goleadores | Difference | `.scorer-divider { mix-blend-mode: difference; }` | OK |
| Icono estadio | Exclusion | `.venue img { mix-blend-mode: exclusion; }` | OK |
| Nombre estadio | Exclusion | `.venue { mix-blend-mode: exclusion; }` | OK |
| Logo Deportev | Normal en export actual | `.publisher-logo` sin blend mode | OK |

## Reglas de fidelidad para blend modes

- Aplicar el blend mode en el elemento hoja que pinta pixeles visibles: texto, `img`, `svg`, divisor, marco, mascara o capa decorativa.
- Evitar aplicar el mismo `mix-blend-mode` en un wrapper y tambien dentro del SVG hijo. Esa doble mezcla puede oscurecer, invertir o suavizar el resultado de forma distinta a Figma.
- Si el SVG ya trae `mix-blend-mode` interno desde Figma, elegir una sola estrategia:
  - Mantener el blend dentro del SVG si el export reproduce la relacion de capas original.
  - Mover el blend al wrapper o al `img` si el SVG necesita mezclarse contra el fondo HTML final.
- Documentar cualquier excepcion donde wrapper y SVG tengan blend modes distintos, indicando que Figma tenia capas anidadas con mezclas distintas.
- No usar `preserveAspectRatio="none"` en logos, iconos oficiales, escudos, marcos de bandera o simbolos reconocibles.
- Usar `preserveAspectRatio="xMidYMid meet"`, `object-fit: contain` y contenedores con proporcion estable para logos y SVGs oficiales.
- Solo permitir deformacion intencional en ornamentos abstractos, mascaras, fondos o lineas decorativas que en Figma funcionen como relleno flexible.

## Reglas especificas para elementos hoja

Los siguientes elementos deben verificarse como hojas visuales, no solo por clase en el contenedor:

- `subtitle-left.svg` y `subtitle-right.svg`: el `difference` debe afectar la linea visible, sin duplicarse en wrapper + SVG interno.
- `flag-border.svg`: el marco no debe estirarse ni perder proporcion; si usa `difference`, verificar el nodo final que pinta el borde.
- `worldcup-logo.svg`: el logo debe mantener proporcion oficial y usar `screen` una sola vez.
- `stadium-icon.svg`: el icono debe mantener proporcion y usar `exclusion` contra el fondo real del venue.
- Textos con `difference`: torneo, fase, grupo/jornada, equipos, marcador, estado y goleadores deben mezclarse como capas visibles individuales.

## Verificacion de `difference`

`difference` puede verse muy sutil sobre fondos oscuros o casi negros. Esto no implica automaticamente que falte el blend mode; puede ser el resultado correcto si Figma tambien lo muestra asi sobre el mismo fondo.

Checklist de verificacion:

- Comparar el WebP final contra el export de Figma con el mismo fondo, escala y crop.
- Inspeccionar el elemento en navegador para confirmar que el `mix-blend-mode` efectivo esta en el nodo visible.
- Revisar que no exista un wrapper padre con el mismo blend mode, `opacity`, `filter`, `transform` o `isolation` que cree un stacking context no equivalente.
- Alternar temporalmente un fondo claro y uno oscuro solo para diagnosticar si `difference` esta activo; revertir esa prueba antes de entregar.
- Si el efecto es casi imperceptible sobre el fondo real pero coincide con Figma, registrar "sutil por fondo oscuro" como observacion esperada.

## Checklist de aprobacion

- Auto Layout respetado en los grupos que contienen textos, equipos, marcador, goleadores y venue.
- SVGs/logos conservan proporcion y no estan aplastados para encajar.
- Blend modes aplicados en elementos hoja, no duplicados sin justificacion.
- `difference` verificado visualmente sobre el fondo real.
- Comparacion final hecha contra screenshot/export de Figma, no solo contra CSS.

## Pendientes de fidelidad no relacionados al blend

- Confirmar si la capa de luces debe usar la mascara exportada `lights-mask`.
- Cambiar el circulo simple de banderas por la mascara exacta del componente de Figma.
- Agregar las fuentes faltantes: `Metropolis Black Italic` y `Bebas Neue Pro`.
