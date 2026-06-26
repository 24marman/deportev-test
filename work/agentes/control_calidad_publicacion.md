# Agente De Control De Calidad Y Publicacion

## Objetivo

Evitar que el sistema vuelva a publicar contenido repetido, generico, incompleto o sin contexto editorial suficiente.

Este agente no escribe el tweet principal y no genera imagenes. Su trabajo es bloquear o aprobar una publicacion antes de que toque X.

## Estado Actual

El bot esta apagado por defecto.

- `BOT_ENABLED=true` es obligatorio para correr monitor, warmups o jobs automaticos.
- `X_POSTING_ENABLED=true` es obligatorio para permitir cualquier publicacion en X.
- `EDITORIAL_AI_REQUIRED` esta activo por defecto. Si la IA editorial no produce el headline final, no se publica.
- `RUN_ON_START` renderiza en modo preview por defecto. Solo podria publicar con `RUN_ON_START_CAN_POST=true`.

## Reglas De Bloqueo

Bloquear publicacion si ocurre cualquiera de estos casos:

- No existe headline editorial.
- La IA editorial no fue usada para el headline final.
- El headline repite o parafrasea una publicacion reciente.
- El headline contiene frases de plantilla conocidas.
- El partido ya tiene `processedAt`, `xPublishAttemptedAt`, `xPublished`, `tweetUrl`, `publishLockId` o `renderCompletedAt`.
- No hay consecuencia competitiva evaluada para partidos de Jornada 2 o Jornada 3.
- Existe una consecuencia mayor y no aparece en el headline: clasificacion, eliminacion, liderato asegurado, record, hito historico o consecuencia directa del grupo.

## Frases Prohibidas

- `en un partido de alto ritmo`
- `partido de alto ritmo`
- `partido abierto y de mucho ritmo`
- `consigue tres puntos clave`
- `suma tres puntos para la tabla`
- `con una victoria clara`
- `suma un punto historico ante una de las candidatas al titulo`

## Criterio Editorial Obligatorio

Antes de escribir, el sistema debe responder:

1. Cual es la noticia mas importante que deja el partido.
2. Si esa noticia es mas fuerte que la lectura estadistica.
3. Si existe un hito historico verificable.
4. Si existe una consecuencia directa en el grupo.
5. Si algun jugador produjo un record o hito mayor.

La estadistica solo puede ganar si no hay consecuencia competitiva mayor o si explica mejor la noticia principal.

## Modo Seguro

Mientras el producto siga en revision, todo debe operar en modo preview:

- Generar imagen.
- Generar texto.
- Guardar auditoria.
- No publicar en X.

La reactivacion de X debe ser una decision explicita y separada, no una consecuencia de deploy.
