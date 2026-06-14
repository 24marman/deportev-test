# Arquitectura De Automatizacion De Contenido

## Objetivo

Generar automaticamente piezas visuales del Mundial 2026 cuando termine un partido:

1. Detectar resultado del partido desde una fuente de datos.
2. Obtener equipos, marcador, goleadores, grupo, jornada y estadio.
3. Resolver assets automaticamente: banderas/escudos y estadio.
4. Renderizar el template correspondiente.
5. Revisar reglas de QA.
6. Publicar en X si cumple los criterios.

## Banderas Y Escudos

No deben cargarse manualmente por cada partido.

El sistema debe tener una libreria de assets con claves estables:

```json
{
  "teamId": "QAT",
  "name": "Qatar",
  "flagUrl": "assets/flags/qat.svg",
  "crestUrl": "assets/teams/qat.png"
}
```

Cuando la data diga que juega Qatar, el renderizador busca automaticamente `QAT` y coloca la bandera o escudo correspondiente.

## Estadios

El estadio tambien debe resolverse automaticamente desde la data del partido.

```json
{
  "venueId": "SFO",
  "name": "San Francisco Bay Area Stadium",
  "imageUrl": "assets/stadiums/sfo.png"
}
```

Cuando el partido venga con `venueId` o `venue.name`, el sistema carga la imagen de estadio correspondiente y le aplica el tratamiento visual del template.

## Rol De La IA

La IA puede ayudar en:

- Normalizar nombres de equipos y estadios cuando la fuente de datos usa variantes.
- Buscar coincidencias entre `venue.name` y nuestra libreria de estadios.
- Generar fondos estilizados si no necesitamos una foto real del estadio.
- Hacer QA visual: revisar si el escudo, bandera, marcador y texto se ven correctos.
- Redactar captions para X.

La IA no debe ser la fuente principal para:

- Resultados oficiales.
- Escudos o logos oficiales sin licencia.
- Fotos reales de estadios sin derechos claros.
- Datos deportivos que deben ser exactos.

## Flujo Automatico

```text
Data Provider
  -> Match Normalizer
  -> Asset Resolver
  -> Template Renderer
  -> QA Gate
  -> X Publisher
```

## Agentes De Assets

El sistema separa responsabilidades:

- Agente De Selecciones Y Assets: resuelve banderas, escudos, nombres y codigos de equipos.
- Agente De Estadios Background: resuelve imagenes de estadios y tratamiento visual.
- Agente De Assets Y Licencias: valida origen, licencia y riesgos de uso.

## Que Es La Pagina Local

La pagina local no es el producto final. Es el renderizador/preview del template.

Sirve para:

- Ver el diseno en navegador.
- Probar datos dinamicos.
- Validar posiciones, tamanos y estilos.
- Exportar una imagen PNG final en el futuro.

El producto completo es el sistema que genera imagenes dinamicas automaticamente.

## MVP Recomendado

Para el primer MVP:

- Usar una fuente de datos deportiva confiable.
- Crear una libreria local de flags/escudos para equipos.
- Crear una libreria local de imagenes de estadios para las sedes.
- Renderizar un template: marcador final.
- Publicar primero en modo borrador/aprobacion manual.
- Activar autopost solo cuando QA sea confiable.

## Riesgos

- Google no necesariamente ofrece una API publica directa para resultados deportivos.
- Las APIs deportivas confiables pueden ser de pago.
- X requiere API/token con permisos de escritura para publicar.
- Escudos, logos oficiales, fotos de jugadores y fotos de estadios pueden tener restricciones de licencia.
- Automatizar sin QA puede publicar resultados incorrectos o assets equivocados.
