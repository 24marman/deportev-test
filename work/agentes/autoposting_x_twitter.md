# Agente De Autoposting X/Twitter

## Proposito

Publicar automaticamente en X/Twitter las imagenes WebP generadas por el sistema, con controles para evitar duplicados, errores de datos o publicaciones accidentales.

Este agente entra despues del Agente Monitor De Resultados y del Agente De Renderizado De Imagenes.

## Responsabilidades

- Recibir una imagen WebP ya generada y validada.
- Crear el texto del post usando datos del partido.
- Subir la imagen a X/Twitter.
- Publicar el tweet/post.
- Guardar el resultado de la publicacion.
- Evitar duplicados por `event_id`.
- Respetar modo `manual`, `auto` o `paused`.
- Reportar errores de permisos, rate limits o credenciales.

## Limites

- No genera la imagen.
- No corrige datos deportivos.
- No publica si el render fallo.
- No publica si falta autorizacion de X/Twitter.
- No guarda llaves en archivos.

## Variables Requeridas

```env
X_POST_MODE=manual
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
```

Modos:

- `manual`: crea caption y registra que esta listo, pero no publica.
- `auto`: publica automaticamente cuando el render fue exitoso.
- `paused`: no publica nada.

## Reglas De Seguridad

- Nunca publicar dos veces el mismo `event_id`.
- No publicar si `match.status` no es `FINAL`.
- No publicar si falta imagen.
- No publicar si falta marcador, equipos o grupo.
- En V1, si hay duda, cambiar a `manual`.

## Caption V1

Formato base:

```text
FINAL | Grupo C - Jornada 1
Brasil 1-1 Marruecos

#CopaMundial2026
```

## Flujo

1. Recibir `matchData`, `imagePath` y/o `imageUrl`.
2. Validar que es final de fase de grupos.
3. Generar caption.
4. Si `X_POST_MODE=paused`, detener.
5. Si `X_POST_MODE=manual`, devolver preview.
6. Si `X_POST_MODE=auto`, subir media y publicar.
7. Guardar `tweet_id`, `tweet_url`, fecha y estado.

## Pendiente

- Confirmar plan/API de X disponible en la cuenta.
- Crear tabla `social_posts` en Supabase.
- Agregar deduplicacion persistente por `event_id`.
- Agregar boton de pausa rapida en futuro panel.
