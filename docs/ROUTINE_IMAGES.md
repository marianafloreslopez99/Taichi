# Imágenes por frase

Cada `voiceGuide` conserva su texto, pausa e imagen. Las imágenes están en
`public/img/routines/j1` hasta `j7`; el JSON guarda rutas como `j2/1.jpg` para
evitar colisiones entre rutinas. Las referencias antiguas como `1.jpg` siguen
siendo compatibles. La imagen y el texto se actualizan al comenzar cada frase
con el reproductor de voz existente.

El contenido se importó de `routinescompleto.zip`, corrigiendo comas faltantes.
En la rutina 1, la referencia a `15.jpg` (ausente en el ZIP) se corrigió a `9.jpg`,
la imagen ya utilizada para la misma frase de cambio de peso. En la rutina 6,
`3jpg` se corrigió a `3.jpg`. Se conservaron las imágenes generales de los
movimientos del proyecto como respaldo.

La rutina 4 tiene 26 frases ilustradas. Se generaron 12 imágenes con la
herramienta integrada `image_gen`, tomando `routines/j4/1.jpg` del ZIP como
referencia de personaje, estilo y escenario. Se reutilizan imágenes cuando las
frases describen la misma postura o dan una indicación de estabilidad. Los
prompts completos están en `routine4-image-prompts.json`.

Para actualizar otra base de datos con este contenido, ejecutar `npm run db:seed`.
No se requiere una migración: las imágenes son parte del campo JSON `voiceGuide`.

Las pruebas comprueban las 212 frases, la existencia de sus archivos, el rechazo
de rutas inválidas, la separación de imágenes entre rutinas y el respaldo ante
un error de carga. También se mantienen las pruebas de práctica y control por voz.
