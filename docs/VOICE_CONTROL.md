# Control por voz y tiempos de respuesta

La página principal reúne el saludo, la invitación a seleccionar la opción preferida y la explicación de comandos en el contenedor «Tu guía de voz». El saludo usa la zona `America/Mexico_City`: «Buenos días» de las 06:00 a las 11:59, «Buenas tardes» de las 12:00 a las 18:59 y «Buenas noches» desde las 19:00 hasta las 05:59. La hora se calcula al abrir la guía y al volver a escucharla. Solo aparece la sección que se está narrando: saludo, invitación y luego cada grupo de comandos reemplazan al texto anterior. Al terminar queda la invitación a seleccionar una rutina. La guía y las tarjetas del catálogo usan un diseño compacto para dejar visible la primera fila con sus botones en pantallas de escritorio habituales. Se puede detener o volver a escuchar la bienvenida. Elegir una rutina cancela la explicación del catálogo; la práctica anuncia el nombre de la rutina y empieza los movimientos. «Escuchar comandos», «Ver comandos» y los comandos de ayuda permanecen en su ubicación habitual dentro de la práctica.

La escucha continua conserva el comportamiento habitual. «Pulsar para hablar» permite escuchar una sola intervención por pulsación, incluso dentro de la confirmación de finalizar. Después de una frase, silencio, error de conexión o cierre del reconocimiento, vuelve a esperar otra pulsación. Hay un límite de doce segundos por captura; «Terminar escucha» pide el resultado final al navegador y espera como máximo cinco segundos. Apagar el micrófono, cambiar de modo, narrar ayuda o abrir un panel cancela la escucha anterior y sus temporizadores. No se añade captura de audio adicional ni procesamiento de ruido o eco.

«Pausar» provisional interrumpe el audio de inmediato; solo la frase definitiva solicita la transición de sesión. Una corrección o cuatro segundos sin confirmar restauran la guía desde la frase interrumpida. La confirmación de finalizar se procesa exclusivamente con resultados definitivos, después de narrar la pregunta de confirmación.

Los comandos definitivos y los botones de la práctica comparten una cola: cada acción usa el estado aplicado por la anterior. «Pausar» corta el audio al recibirse y conserva su turno para actualizar la sesión. La guía, «Repetir» y la ayuda pendientes antes de esa pausa no vuelven a iniciar audio; «Continuar» posterior puede retomarlo. La ayuda en curso mantiene suspendido el reconocimiento y los botones esperan a que termine; pulsar «Pausar» puede cortarla inmediatamente.

Si falla una acción se descartan los comandos en espera y se pide repetirlos. Al abrir la confirmación de finalizar también se descartan; cancelar la confirmación no los recupera. Salir de la pantalla invalida la acción local en curso y vacía la cola; una petición HTTP ya enviada puede terminar, pero no inicia otras acciones de esa cola. Se admiten diez comandos entre ejecución y espera, más un lugar reservado para «Pausar»; al llenarse se muestra un aviso para repetir el comando. Repetir intencionalmente una frase crea otra acción; un mismo resultado definitivo del reconocedor se procesa una vez.

Los controles de voz agrupan el selector de modo, los botones de micrófono y ayuda, y una fila completa para «Pulsar para hablar». El azul claro es compartido por el hover y la indicación visual de comandos: el botón correspondiente se resalta al reconocer la acción, permanece resaltado durante una petición y vuelve a su color normal un segundo después. Una pausa provisional corregida, vencida o fallida retira el resaltado. El botón «Pulsar para hablar» se mantiene resaltado mientras escucha.

## Diagnóstico local

Los comandos admitidos funcionan también después de «Oye» o «Tengo una duda»: «Oye, paúsalo», «Tengo una duda: continúa» y «Oye, repite». Decir la activación y después un comando en otra intervención también ejecuta el comando sin abrir una consulta Gemini. Solo se reconocen frases completas del catálogo: «no pauses» o una pregunta que contiene «siguiente» no ejecutan acciones por coincidencia parcial. Una frase activada que no sea comando conserva el flujo de pregunta existente.

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

| Fase          | Qué mide                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recognition` | Desde el evento de fin del habla hasta el resultado definitivo. Si el navegador no entrega ese evento, desde la primera transcripción provisional; si solo entrega un resultado definitivo, no permite estimar la demora de reconocimiento.             |
| `audio-stop`  | Desde recibir la transcripción de pausa hasta cancelar la narración local.                                                                                                                                                                              |
| `queue-wait`  | Desde aceptar el comando hasta comenzar su ejecución, después de aplicar el estado de la acción anterior. Solo registra comandos que llegan a ejecutarse.                                                                                               |
| `action`      | Desde comenzar la ejecución hasta terminar la actualización de sesión, incluyendo petición, respuesta y procesamiento local. En acciones de audio mide su inicio; en ayuda, su narración completa. La finalización se mide a partir de la confirmación. |

El detalle incluye comando, fase, duración y resultado (`success` o `error`). `audioStopBasis` distingue el corte provisional, definitivo o por botón; si el provisional de la misma captura y posición sigue activo al llegar el definitivo, no se registra otro corte. El resumen separa comandos para que Repetir local no oculte la demora de las acciones persistentes.

Las transiciones también registran `http` (petición completa), `http-headers` (hasta recibir cabeceras) y `response-body` (lectura/parseo del cuerpo), con `requestId` y estado HTTP. En desarrollo, `Server-Timing` aporta `server`, `db-read`, `db-write` y, al avanzar, `db-movement-count`. `db-elapsed` solo figura en las mediciones históricas anteriores a integrar el tiempo en la escritura final. Son duraciones independientes: no restar relojes absolutos de cliente y servidor ni sumar el total con sus etapas. La cabecera no se añade en producción.

Una demora alta en `recognition` apunta al reconocimiento o su conexión; una demora alta en `action` requiere revisar la petición y el backend. Para comparar, repetir el mismo comando en silencio y con ruido usando el mismo navegador y conexión. Los registros se limitan para que la instrumentación no crezca durante una sesión larga.

### Evaluación opcional en desarrollo

Comandos y preguntas comparten un coordinador de captura. Una pregunta sustituye y cancela al reconocedor de comandos, incluidos sus reintentos pendientes; los callbacks de una captura sustituida no pueden emitir nuevas acciones. Cancelar una pregunta resuelve su cancelación inmediatamente y limpia callbacks, sin esperar que el navegador anuncie el fin.

El adaptador continuo está preparado para pedir una finalización graciosa: conserva el resultado definitivo y se rearma después del fin, con una espera máxima de cinco segundos si falta el evento. Esa capacidad todavía no se activa por VAD. En preguntas, si ya hay texto definitivo y el navegador omite el fin después de `stop()`, se libera la captura al vencer ese mismo plazo y se conserva el texto. Un provisional nunca se envía por vencimiento del plazo.

En `npm run dev`, la consola dispone de `window.taichiVoiceDiagnostics`, conectada a la misma instancia que usa la aplicación. No existe esa interfaz global en el build de producción. Iniciar explícitamente antes de probar una condición:

```js
window.taichiVoiceDiagnostics.start({
  browser: 'chrome',
  device: 'desktop',
  deviceProfile: 'primary',
  noise: 'quiet',
  audioOutput: 'speakers',
  startup: 'warm',
})
```

Repetir al menos 30 comandos por condición con el mismo navegador, posición y volumen. Anotar por separado los fallos de reconocimiento, sin considerarlos éxitos porque no aparezcan en el resumen. No cambiar micrófono/modo/ruido dentro de la misma evaluación; iniciar otra para cada condición. Para un arranque frío iniciar antes de entrar a una rutina; para un arranque caliente iniciar cuando el micrófono ya esté atento. Las preguntas reales siguen usando Gemini: no enviarlas solo para medir comandos.

Al terminar:

```js
window.taichiVoiceDiagnostics.finish()
console.table(window.taichiVoiceDiagnostics.summary())
copy(window.taichiVoiceDiagnostics.export())
```

`copy()` es una utilidad de DevTools de Chrome/Edge. En otros navegadores se puede mostrar el JSON con `console.log(window.taichiVoiceDiagnostics.export())` y copiarlo manualmente. El archivo se guarda manualmente; la aplicación no sube mediciones ni descarga archivos automáticamente. `clear()` descarta la evaluación en memoria. Iniciar otra evaluación requiere finalizar la anterior y reemplaza los datos anteriores.

Se guardan como máximo 1000 entradas, combinando eventos y duraciones; `droppedEntries` indica si se llenó el registro. No usar una muestra truncada como un ensayo completo. El JSON incluye metadatos de condición, tiempos, tipo de captura, identificador y posición del resultado; no contiene audio ni transcripciones. Una captura continua puede contener varios resultados: correlacionar por `captureId` y `resultIndex`.

El JSON actual usa `schemaVersion: 2`. El resumen calcula percentiles por rango más próximo y separa comandos, éxitos/errores, origen de corte y origen de reconocimiento:

- `speech-end-event`: parte del evento `onspeechend` del navegador; no certifica el fin acústico exacto.
- `first-result`: parte del primer resultado provisional; no compararlo directamente con el origen anterior.
- `unavailable`: no hubo una referencia anterior al resultado final; se conserva como evento sin incluirlo en percentiles de reconocimiento.

Los eventos registran solicitud/inicio de reconocimiento, primer provisional por resultado, inicio/fin de habla, inicio/fin de audio, definitivo, cierre, cancelación y error con código. También indican comandos encolados, cola llena o frases ignoradas con motivo, sin conservar sus textos. Si deja de responder, exportar antes de recargar o reiniciar el micrófono y anotar el estado visible. La ausencia de eventos no demuestra por sí sola que el motor esté detenido. Se observa también la captura de preguntas, sin generar por ahora un resumen automático de latencia de Gemini. El baseline completo y la precisión por dispositivo siguen pendientes. El primer análisis y la medición HTTP están en [Medición HTTP y correcciones](VOICE_HTTP_FINDINGS.md).
