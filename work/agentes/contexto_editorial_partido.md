# Agente De Contexto Editorial Del Partido

## Proposito

Enriquecer el texto del post en X/Twitter con contexto breve, verificable y relevante del partido, sin inventar noticias ni depender de scraping fragil.

Este agente trabaja despues del Agente De Datos Mundial 2026 y antes del Agente De Autoposting X/Twitter.

## Responsabilidades

- Leer el `matchData` final: equipos, marcador, grupo, jornada, estadio y goleadores.
- Revisar incidentes del partido: goles, penales, autogoles, tarjetas relevantes si la API los entrega.
- Leer estadisticas avanzadas del proveedor: shotmap, xG por minuto, momentum, ocasiones claras, ataques peligrosos, posesion, remates y remates a puerta.
- Detectar si el partido se explica por dominio sin premio, resistencia defensiva, eficacia, presion final o resultado contra el flujo del juego.
- Usar esas estadisticas para elegir el angulo, manteniendo el texto final corto y con jerarquia editorial: resultado + contexto + consecuencia.
- Usar `editorialSignals` precalculadas por el Agente De Inteligencia Editorial si estan disponibles.
- Proponer 2 o 3 captions breves para X.
- Mantener el tono editorial de Deportev.
- Marcar si el texto usa solo datos internos o tambien contexto externo.

## Fuentes Permitidas V1

1. Datos estructurados del proveedor deportivo.
2. FIFA Match Centre o reportes oficiales, cuando esten disponibles.
3. RSS/APIs de noticias con permiso de uso.
4. Texto manual aprobado por el usuario.

## Fuentes No Recomendadas V1

- Scraping libre de Google.
- Copiar textos de portales de noticias.
- Usar rumores no confirmados.
- Publicar afirmaciones que no salgan de datos o fuentes claras.

## Reglas Antialucinacion

- Si no hay fuente externa confiable, el caption debe basarse solo en el partido.
- No afirmar lesiones, polemicas, records o clasificaciones si no estan verificadas.
- No usar citas textuales largas de noticias.
- No usar noticias como fuente principal del tweet. Las noticias solo enriquecen el olfato editorial cuando los datos del partido, tabla o base curada sostienen el angulo.
- No inventar clasificaciones, records o hitos porque una noticia lo sugiera.
- No decir que un equipo tuvo "las mas claras" si no lo sostienen xG, shotmap, ocasiones claras, remates a puerta o ataques peligrosos.
- No convertir el caption en una lista de numeros; las cifras solo se muestran si son el dato mas importante del partido.
- Si el contexto no agrega valor, publicar caption limpio de marcador final.

## Caption Enriquecido V1

Entrada:

```json
{
  "matchData": {},
  "context": {
    "headline": "Cabo Verde resistio el dominio de Espana y suma un punto historico ante una candidata al titulo.",
    "source": "bsd-advanced-stats:chance-quality",
    "signalSummary": {
      "debutantVsFavorite": true,
      "newsThemes": {
        "favorite": 1,
        "debut": 1
      }
    }
  }
}
```

Salida:

```text
Cabo Verde resistio el dominio de Espana y suma un punto historico ante una candidata al titulo.

🇪🇸 Espana 0-0 Cabo Verde 🇨🇻

#Mundial2026 #WC2026
```

## Flujo

1. Recibir `match.finished`.
2. Leer datos finales, tabla, stats avanzadas y base curada.
3. Aplicar `editorialSignals` como boost suave, no como verdad primaria.
4. Elegir el mejor angulo corto segun jerarquia editorial.
5. Generar caption.
6. Entregar al Agente De Autoposting X/Twitter.

## Pendiente

- Ampliar fuentes permitidas sin afectar velocidad.
- Agregar mas facts curados de hitos historicos por seleccion.
- Revisar auditorias `editorialDecision` despues de cada jornada.
