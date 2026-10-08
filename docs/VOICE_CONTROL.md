# Control por voz y tiempos de respuesta

La página principal reúne el saludo, la invitación a seleccionar la opción preferida y la explicación de comandos en el contenedor «Tu guía de voz». El saludo usa la zona `America/Mexico_City`: «Buenos días» de las 06:00 a las 11:59, «Buenas tardes» de las 12:00 a las 18:59 y «Buenas noches» desde las 19:00 hasta las 05:59. La hora se calcula al abrir la guía y al volver a escucharla. Solo aparece la sección que se está narrando: saludo, invitación y luego cada grupo de comandos reemplazan al texto anterior. Al terminar queda la invitación a seleccionar una rutina. La guía y las tarjetas del catálogo usan un diseño compacto para dejar visible la primera fila con sus botones en pantallas de escritorio habituales. Se puede detener o volver a escuchar la bienvenida. Elegir una rutina cancela la explicación del catálogo; la práctica anuncia el nombre de la rutina y empieza los movimientos. «Escuchar comandos», «Ver comandos» y los comandos de ayuda permanecen en su ubicación habitual dentro de la práctica.

La escucha continua conserva el comportamiento habitual. «Pulsar para hablar» permite escuchar una sola intervención por pulsación, incluso dentro de la confirmación de finalizar. Después de una frase, silencio, error de conexión o cierre del reconocimiento, vuelve a esperar otra pulsación. Hay un límite de doce segundos por captura; «Terminar escucha» pide el resultado final al navegador y espera como máximo cinco segundos. Apagar el micrófono, cambiar de modo, narrar ayuda o abrir un panel cancela la escucha anterior y sus temporizadores. No se añade captura de audio adicional ni procesamiento de ruido o eco.

«Pausar» provisional interrumpe el audio de inmediato; solo la frase definitiva solicita la transición de sesión. Una corrección o cuatro segundos sin confirmar restauran la guía desde la frase interrumpida. La confirmación de finalizar se procesa exclusivamente con resultados definitivos, después de narrar la pregunta de confirmación.

Los controles de voz agrupan el selector de modo, los botones de micrófono y ayuda, y una fila completa para «Pulsar para hablar». El azul claro es compartido por el hover y la indicación visual de comandos: el botón correspondiente se resalta al reconocer la acción, permanece resaltado durante una petición y vuelve a su color normal un segundo después. Una pausa provisional corregida, vencida o fallida retira el resaltado. El botón «Pulsar para hablar» se mantiene resaltado mientras escucha.

## Diagnóstico local

`src/application/voiceLatency.ts` conserva los últimos veinte registros en memoria y publica la última medición de cada fase mediante Performance API. No almacena audio, transcripciones ni datos del usuario; tampoco envía las mediciones a un servidor. Las duraciones son observadas en el navegador y no prometen una latencia fija del proveedor de reconocimiento.

En la consola de desarrollo del navegador:

```js
console.table(
  performance
    .getEntriesByType('measure')
    .filter((entry) => entry.name.startsWith('taichi.voz.'))
    .map((entry) => ({
      fase: entry.name,
      ms: entry.duration,
      ...entry.detail,
    })),
)
```

| Fase          | Qué mide                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recognition` | Desde el evento de fin del habla hasta el resultado definitivo. Si el navegador no entrega ese evento, desde la primera transcripción provisional; si solo entrega un resultado definitivo, no permite estimar la demora de reconocimiento. |
| `audio-stop`  | Desde recibir la transcripción de pausa hasta cancelar la narración local.                                                                                                                                                                  |
| `action`      | Desde aceptar un comando hasta terminar la actualización de sesión, incluyendo petición, respuesta y procesamiento local. La finalización se mide a partir de la confirmación.                                                              |

El detalle incluye comando, fase, duración y resultado (`success` o `error`). Una demora alta en `recognition` apunta al reconocimiento o su conexión; una demora alta en `action` requiere revisar la petición y el backend. Para comparar, repetir el mismo comando en silencio y con ruido usando el mismo navegador y conexión. Los registros se limitan para que la instrumentación no crezca durante una sesión larga.
