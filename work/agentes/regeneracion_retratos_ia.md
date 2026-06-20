# Agente: Regeneracion de Retratos IA

## Rol

Convertir cualquier imagen de referencia de un futbolista en un retrato candidato para la biblioteca visual del template de goleadores.

Este agente no decide goleadores, no arma el template completo y no publica contenido. Su unica responsabilidad es producir un asset visual consistente: rostro cercano, blanco y negro, extra grunge y fondo verde removible.

Regla principal: preservar la identidad visual del input. Si el resultado parece otra persona, se rechaza aunque el estilo sea bonito.

## Entrada

```json
{
  "inputImage": "ruta/local/o/url/de/referencia",
  "playerKey": "bsd-12345-o-slug",
  "direction": "left",
  "subject": "footballer"
}
```

`playerKey` es solo una llave tecnica para guardar y reutilizar. El prompt visual no depende de nombres publicos para evitar resultados raros, bloqueos o caras genericas mal etiquetadas.

## Salida

```text
outputs/player-assets/portraits/{playerKey}/
  portrait-prompt.txt
  preserved-source-green.png
  generated-source.png
  approved-hero.webp
  manifest.json
```

## Contrato Visual

- Rostro y cuello como protagonistas.
- Muy poco hombro.
- Sin torso.
- Sin playera protagonista.
- Sin escudos, logos, texto ni marcas inventadas.
- Blanco y negro real, no apenas desaturado.
- Grano fuerte, textura rayada, apariencia impresa y sucia.
- Fondo completamente plano `#00ff00`.
- El sujeto no debe usar verde puro para que el recorte sea limpio.
- El rostro debe llenar el alto del bloque; puede cortar un poco cabello.
- El resultado debe funcionar al ser recortado con alpha y colocado en el rectangulo del template.
- No se acepta una cara generica si la imagen de entrada ya trae un rostro claro.

## Flujo

1. Recibe una imagen de referencia.
2. Primero ejecuta modo `preserve`: usa los pixeles originales, hace close-up, blanco y negro, grunge, alpha y fuente verde.
3. Si `preserve` no alcanza calidad, construye un prompt de edicion con `buildPortraitPrompt`.
4. Pide a la IA preservar rostro exacto, no inventar otra persona.
5. Guarda el resultado crudo como `generated-source.png`.
6. Ejecuta `removeChromaAndApplyGrunge`.
7. Genera `approved-hero.webp` como candidato.
8. Escribe `manifest.json` con version, prompt y estado.
9. Entrega preview al orquestador para aprobacion humana.
10. Si se aprueba, el asset queda listo para ser subido a Supabase como retrato reutilizable.

## Comando

```bash
npm run portrait:preserve -- --input ./referencia.png --player-key bsd-12345 --focus right
```

Si se necesita intentar una edicion IA preservando identidad:

```bash
npm run portrait:ai -- --input ./referencia.png --player-key bsd-12345 --direction left
```

Si la IA ya genero una imagen con fondo verde y solo se necesita procesarla:

```bash
npm run portrait:finalize -- --generated ./generated-source.png --player-key bsd-12345
```

Si solo se quiere preparar el prompt:

```bash
npm run portrait:prompt -- --input ./referencia.png --player-key bsd-12345
```

## QA Obligatorio

Antes de aprobar:

- La cara no parece de plastico ni generica.
- La cara sigue pareciendose claramente a la imagen de entrada.
- La pose no se repite exactamente en todos los jugadores.
- El grunge es visible dentro del rostro, no solo en el fondo.
- El fondo verde es uniforme.
- El recorte no deja halo verde importante.
- El asset funciona en el template sin aire vertical.
- No hay texto, escudos, marcas ni playeras reconocibles como foco.

## Regla de Produccion

Este agente corre antes de la publicacion. El bot nunca debe detenerse al final de un partido para generar un rostro nuevo.
