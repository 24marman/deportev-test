# Agente De Selecciones Y Assets

## Proposito

Resolver automaticamente los assets visuales de equipos/selecciones para los templates del producto: banderas, escudos, nombres, codigos y variantes.

Este agente evita que el usuario tenga que colocar banderas manualmente en Figma o en cada render.

## Responsabilidades

- Crear y mantener una libreria de selecciones.
- Mapear nombres deportivos, codigos FIFA y codigos ISO.
- Resolver la bandera correcta para cada equipo.
- Definir si el template usa bandera, escudo o ambos.
- Proveer rutas de assets al renderizador.
- Coordinar con assets/licencias para validar que las fuentes sean usables.
- Definir fallbacks si falta una bandera o escudo.

## Limites

- No genera resultados deportivos.
- No decide el layout del template.
- No publica en redes.
- No usa escudos/logos oficiales sin validar licencia.
- No obliga al disenador a crear banderas manualmente en Figma.

## Fuente Recomendada Para MVP

Para banderas:

- `flag-icons`
- Sitio: `https://flagicons.lipis.dev/`
- Licencia: MIT.
- Usa codigos ISO alpha-2.

## Mapeo Necesario

La data deportiva puede venir como nombre, codigo FIFA o ID interno. La libreria de banderas usa ISO alpha-2.

Ejemplo:

```json
{
  "MEX": {
    "displayName": "Mexico",
    "fifaCode": "MEX",
    "iso2": "mx",
    "flagAsset": "assets/flags/1x1/mx.svg"
  },
  "QAT": {
    "displayName": "Qatar",
    "fifaCode": "QAT",
    "iso2": "qa",
    "flagAsset": "assets/flags/1x1/qa.svg"
  },
  "SUI": {
    "displayName": "Switzerland",
    "fifaCode": "SUI",
    "iso2": "ch",
    "flagAsset": "assets/flags/1x1/ch.svg"
  }
}
```

## Flujo

1. La data del partido dice quienes juegan.
2. El normalizador identifica cada seleccion.
3. Este agente resuelve su bandera/escudo.
4. El renderizador recibe las rutas de assets.
5. El template coloca las imagenes en los slots `teams.home.flag` y `teams.away.flag`.

## Relacion Con Figma

Figma define el componente visual de bandera:

- Forma circular.
- Mascara.
- Borde.
- Tamano.
- Posicion.
- Tratamiento visual.

Este agente define que bandera se coloca dentro de ese componente.

El disenador puede usar banderas de ejemplo en Figma para visualizar, pero produccion no debe depender de exportar manualmente todas las banderas desde Figma.

## Entregables Esperados

- Tabla de selecciones.
- Mapeo FIFA -> ISO.
- Libreria de banderas.
- Fallback visual.
- Reglas para nombres largos y variantes de idioma.
