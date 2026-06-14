# Template: Marcador Final Mundial 2026

## Archivos Fuente

- `work/templates/marcador_final/eliminatorias-final.svg`
- `work/templates/marcador_final/eliminatorias-final-grupos.png`

## Tamano

- Canvas: 1080 x 1350.
- Formato: vertical 4:5, adecuado para Twitter/X, Instagram feed y piezas editoriales.

## Partes Fijas

- Fondo oscuro con textura.
- Iluminacion de estadio en esquinas superiores.
- Gradientes verdes y sombras.
- Separadores decorativos verdes.
- Marcos circulares de equipos.
- Icono de estadio.
- Branding inferior.
- Estilo general: deportivo, oscuro, grunge/editorial, verde como color principal.

## Campos Dinamicos

- Letra del grupo: `B`.
- Numero de jornada: `1`.
- Estado del partido: `Final`.
- Equipo local.
- Equipo visitante.
- Escudo/bandera local.
- Escudo/bandera visitante.
- Goles local.
- Goles visitante.
- Goleadores local.
- Goleadores visitante.
- Estadio.
- Imagen/arte del estadio en V2, no en V1.
- Branding/publisher, si cambia por cuenta o cliente.

## Observacion Sobre SVG

El SVG exportado desde Figma conserva muy bien la apariencia, pero muchos textos parecen convertidos a `path`. Eso hace dificil reemplazar datos automaticamente.

Para automatizacion conviene reconstruir este template como:

- Fondo/arte fijo rasterizado.
- Capas dinamicas encima con HTML/CSS, SVG propio o Canvas.
- Textos dinamicos reales, no convertidos a vectores.
- Slots de imagen para escudos/banderas.

## Contrato JSON Inicial

```json
{
  "template": "world_cup_2026_group_final_score",
  "competition": {
    "name": "Copa Mundial 2026",
    "phase": "Fase de grupos",
    "groupLetter": "B",
    "matchdayNumber": "1"
  },
  "match": {
    "status": "Final",
    "venue": {
      "name": "San Francisco Bay Area Stadium",
      "city": "San Francisco Bay Area",
      "country": "USA",
      "stadiumImageUrl": "assets/stadiums/san-francisco-bay-area-stadium.png"
    }
  },
  "teams": {
    "home": {
      "name": "Qatar",
      "shortName": "QAT",
      "crestUrl": "assets/teams/qatar.png",
      "score": 4
    },
    "away": {
      "name": "Suiza",
      "shortName": "SUI",
      "crestUrl": "assets/teams/switzerland.png",
      "score": 1
    }
  },
  "events": {
    "homeScorers": [
      { "minute": "73'", "player": "Jugador Uno" },
      { "minute": "73'", "player": "Jugador Uno", "goalType": "penalty" },
      { "minute": "73'", "player": "Jugador Uno", "goalType": "ownGoal" },
      { "minute": "73'", "player": "Jugador Uno" }
    ],
    "awayScorers": [
      { "minute": "73'", "player": "Jugador Uno" }
    ]
  },
  "branding": {
    "publisherLogoUrl": "assets/branding/deportev.svg"
  },
  "style": {
    "primaryColor": "#059946",
    "canvas": {
      "width": 1080,
      "height": 1350
    }
  }
}
```

## Reglas De Layout Dinamico

- Si el nombre del equipo es largo, reducir tamano de fuente o usar version corta.
- Si no hay goleadores de un lado, ocultar la columna correspondiente.
- Si hay demasiados goleadores, limitar filas visibles y usar resumen, por ejemplo `+2`.
- Si el gol fue penal, agregar `(Pen)` junto al nombre.
- Si el gol fue autogol, agregar `(OG)` junto al nombre.
- En columna izquierda, la etiqueta va despues del nombre: `Jugador Uno (Pen)`.
- En columna derecha, la etiqueta va antes del nombre: `(Pen) Jugador Uno`.
- El marcador debe soportar uno o dos digitos.
- El estado debe soportar `Final`, `En vivo`, `Medio tiempo`, `Previa`, `Penales`.
- Escudos o banderas deben recortarse dentro de los circulos.
- En V1, la imagen del estadio queda fija.
- En V2, la imagen del estadio debe cambiar segun `match.venue.stadiumImageUrl`.
- El estadio debe mantenerse en la parte inferior, oscuro, con tinte verde y suficiente contraste para no competir con marcador/equipos.
- Si no existe imagen para una sede, usar un fallback generico de estadio.

## Recomendacion De Handoff En Figma

Para la proxima exportacion:

- Mantener textos dinamicos como texto editable.
- Nombrar capas con tokens: `team.home.name`, `score.home`, `match.status`.
- Separar fondo fijo de capas dinamicas.
- Crear componentes: equipo, marcador, fila de goleador, sede.
- Entregar tipografias o nombres exactos de fuentes.
- Exportar assets fijos por separado: textura, luces, logo, iconos, marcos.
- Exportar el estadio como capa/asset separado para que pueda cambiar por partido.

## Slot Dinamico De Estadio

El template debe separar el fondo en capas:

- `background.texture`: textura oscura general.
- `background.lights`: luces superiores fijas.
- `venue.image`: imagen del estadio del partido.
- `venue.overlay`: tinte verde/sombra para integrar el estadio al estilo.
- `foreground.content`: marcador, equipos, goleadores y textos.

La capa `venue.image` debe ser reemplazable por data. Cada partido debe resolver su estadio y cargar el asset correspondiente.

Las luces superiores no deben depender del estadio. En el nuevo diseno de Figma se tratan como capa fija del template.

Ejemplo:

```json
{
  "match": {
    "venue": {
      "name": "Estadio Azteca",
      "city": "Mexico City",
      "country": "Mexico",
      "stadiumImageUrl": "assets/stadiums/estadio-azteca.png"
    }
  }
}
```

## Reglas Para Imagenes De Estadios

- Misma proporcion o suficiente resolucion para recortar a 1080 x 1350.
- Preferiblemente imagen amplia de estadio o interior.
- Debe funcionar con recorte inferior.
- Aplicar tratamiento uniforme: blanco y negro o muy desaturado, tinte verde, sombras y gradiente oscuro.
- Evitar imagenes con marcas visibles, textos grandes o elementos que compitan con el marcador.
- Validar licencia o usar assets propios/generados/autorizados.
