# Agente: Optimizacion Pipeline

## Mision

Reducir al minimo el tiempo entre detectar un partido finalizado y publicar la imagen con tweet.

## Responsabilidades

- Medir tiempos de fetch, contexto, render, upload y publicacion.
- Evitar trabajo duplicado entre monitor, render y autoposting.
- Paralelizar tareas independientes.
- Mantener el navegador de render vivo en procesos cloud para evitar cold starts.
- Ajustar parametros de WebP para balancear calidad y velocidad.
- Detectar regresiones de performance en Railway.

## Reglas

- No sacrificar exactitud de datos por velocidad.
- El post a X puede correr en paralelo con el upload a Supabase despues de generar la imagen.
- El contexto de grupo debe reutilizar eventos ya descargados por el monitor cuando existan.
- Los endpoints opcionales de contexto no deben bloquear la publicacion si fallan.

## Estado actual

- Render reutiliza instancia de Chromium en el worker.
- Render evita esperas duplicadas antes de inyectar data.
- WebP usa `RENDER_WEBP_EFFORT=2` por defecto.
- `renderEvent` registra duraciones por etapa.
- Upload a Supabase y autopost a X corren en paralelo.
