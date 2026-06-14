# Plan De Libreria De Assets

## Objetivo

Evitar cargar banderas, estadios y recursos visuales manualmente por cada partido.

El sistema debe resolver assets automaticamente a partir de la data normalizada del partido.

## Banderas

Fuente recomendada para MVP:

- `flag-icons`
- Sitio: `https://flagicons.lipis.dev/`
- Repo: `https://github.com/lipis/flag-icons`
- Licencia: MIT.

Ventajas:

- Banderas en SVG.
- Integracion por npm o descarga directa.
- Uso por codigo ISO 3166-1 alpha-2.
- Versiones 4:3 y 1:1.

## Mapeo Necesario

La data deportiva suele usar codigos FIFA o nombres de seleccion. La libreria de banderas usa ISO alpha-2.

Por eso necesitamos una tabla de mapeo:

```json
{
  "MEX": {
    "name": "Mexico",
    "iso2": "mx",
    "flagPath": "assets/flags/1x1/mx.svg"
  },
  "QAT": {
    "name": "Qatar",
    "iso2": "qa",
    "flagPath": "assets/flags/1x1/qa.svg"
  },
  "SUI": {
    "name": "Switzerland",
    "iso2": "ch",
    "flagPath": "assets/flags/1x1/ch.svg"
  }
}
```

## Reglas

- El usuario no debe colocar banderas manualmente en cada render.
- Figma debe definir el componente visual: circulo, mascara, borde y tratamiento.
- Figma puede usar banderas de ejemplo para presentar el diseno.
- El renderizador reemplaza el placeholder por la bandera correcta.
- Para selecciones, usar preferentemente banderas de pais.
- Para clubes, se requeriria otra fuente de escudos/licencias.

## Decision Para Figma

No conviene crear/exportar manualmente todas las banderas desde Figma para produccion.

El flujo recomendado es:

1. En Figma, crear un componente `flag-mask` o `team-flag-slot`.
2. Ese componente define forma, circulo, borde, mascara y estilo.
3. Dentro del componente se coloca una bandera de ejemplo para visualizar.
4. En el sistema, esa imagen se reemplaza automaticamente segun el equipo.

Asi el disenador controla como se ve la bandera, pero el sistema controla cual bandera aparece.

Ejemplo:

```text
Figma:
team.home.flag slot visual

Sistema:
ARG -> ar.svg
QAT -> qa.svg
MEX -> mx.svg
```

Esto evita exportar 48 o mas banderas manualmente y permite cambiar datos de partido sin tocar Figma.

## Estadios

Los estadios no tienen una libreria equivalente universal y segura como las banderas.

Opciones:

1. Libreria propia de imagenes autorizadas.
2. Fondos generados/estilizados por sede sin representar exactamente la foto real.
3. Fotos con licencia clara.
4. Fallback generico de estadio si no hay asset para la sede.

## Mapeo De Estadios

```json
{
  "azteca": {
    "name": "Estadio Azteca",
    "city": "Mexico City",
    "country": "Mexico",
    "imagePath": "assets/stadiums/azteca.png"
  },
  "sfo": {
    "name": "San Francisco Bay Area Stadium",
    "city": "San Francisco Bay Area",
    "country": "USA",
    "imagePath": "assets/stadiums/sfo.png"
  }
}
```

## Rol De IA

Permitido:

- Normalizar nombres de equipos y estadios.
- Resolver coincidencias cuando la data venga con variantes.
- Generar fondos estilizados no oficiales de estadio.
- Revisar si el asset se ve bien en el template.

No recomendado:

- Inventar banderas.
- Inventar escudos oficiales.
- Usar fotos reales sin licencia.
- Depender de IA para datos oficiales del partido.
