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

## Pendientes de fidelidad no relacionados al blend

- Confirmar si la capa de luces debe usar la mascara exportada `lights-mask`.
- Cambiar el circulo simple de banderas por la mascara exacta del componente de Figma.
- Agregar las fuentes faltantes: `Metropolis Black Italic` y `Bebas Neue Pro`.
