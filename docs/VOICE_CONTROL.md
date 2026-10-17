# Control por voz y tiempos de respuesta

La práctica avanza automáticamente al terminar la narración de cada movimiento y los consejos pendientes. Las pausas entre instrucciones duran como máximo 1.5 segundos. «Siguiente» permite adelantar el cambio; «Pausar», las preguntas a IA y la ayuda detienen la narración y el avance. Al terminar el último movimiento se abre la confirmación de finalizar, que requiere una respuesta del usuario. Si falla el cambio de movimiento, se muestra un aviso y se puede reintentar con «Siguiente».

La bienvenida del catálogo solo saluda e invita a elegir una rutina. El saludo usa la zona `America/Mexico_City`: «Buenos días» de las 06:00 a las 11:59, «Buenas tardes» de las 12:00 a las 18:59 y «Buenas noches» desde las 19:00 hasta las 05:59. Se calcula al abrir la guía y al volver a escucharla. El texto muestra la sección actual; al terminar queda la invitación a seleccionar una rutina. Elegir una rutina cancela la bienvenida.

Las explicaciones se distribuyen por contexto: al iniciar la primera práctica se presentan Pausar, Continuar, Ayuda y los dos modos; al avanzar por primera vez se explican Siguiente, Anterior y Repetir; al pausar o terminar la narración de un movimiento se presentan las preguntas a IA; en el último movimiento se recuerda Finalizar; al activar Pulsar para hablar se explica su funcionamiento. Se reproducen entre instrucciones y pueden omitirse con «Omitir explicación». Las explicaciones completadas u omitidas se recuerdan en el navegador mediante `taichi.guidance.v1` en `localStorage`. Una explicación interrumpida al salir o abrir otro panel queda pendiente. Si el almacenamiento no está disponible, se recuerdan durante la práctica actual. Estos textos describen las funciones sin recitar sus respuestas de confirmación.

«Ayuda» o «Necesito ayuda» abre un diálogo y responde «¿En qué te puedo ayudar?». «Cuáles eran los comandos» muestra la lista completa por temas y reproduce una orientación breve. Los botones de movimientos, preguntas a IA, modos del micrófono y finalizar permiten escuchar solo el tema elegido; «Escuchar todos los temas» reproduce la lista completa por petición explícita. «Detener explicación» interrumpe el audio conservando el panel. Mientras se consulta la ayuda se detiene la guía del movimiento. «Continuar» cierra la ayuda y retoma la práctica; «Cerrar ayuda» vuelve al estado anterior. El botón «Ayuda» aparece en el contenedor del micrófono y abre el diálogo de ayuda, con acceso a los temas y al cambio de modo. El modo activo se muestra dentro del diálogo. El cambio también está disponible en el diálogo, incluso mientras se narra un tema. El texto inferior de recordatorio y los enlaces «Abrir ayuda» y «Ver comandos» se retiraron de la pantalla de práctica.

La práctica comienza en escucha continua y el icono permite apagar o reactivar el micrófono. «Aplica el modo Pulsar para hablar» cambia a una sola intervención por pulsación y confirma «Cambiemos a modo Pulsar para hablar.». En ese modo el icono inicia la captura y otra pulsación solicita el resultado final; después de una frase, silencio, error de conexión o cierre del reconocimiento, vuelve a esperar otra pulsación. Para regresar se pulsa el micrófono y se dice «Cambia a escucha continua», «Activa escucha continua» o «Aplica el modo Escucha continua»; la confirmación es «Cambiemos a modo Escucha continua.». Hay un límite de doce segundos por captura; «Terminar escucha» espera como máximo cinco segundos por el resultado final. Cambiar de modo, narrar ayuda o abrir un panel cancela la escucha anterior y sus temporizadores.

Silero VAD v6 está disponible como experimento local mediante `VITE_VOICE_VAD_MODE`: `off` no carga modelo ni abre otra captura, `observe` registra cortes acústicos sin modificar el STT y `endpoint` pide `stop()` al reconocimiento después del silencio. En escucha continua, el cierre solo se arma cuando el provisional coincide con un comando o activación admitidos; en una pregunta abierta se arma toda la intervención. El VAD nunca ejecuta comandos ni envía texto provisional. `endpoint` no es el valor predeterminado hasta completar la comparación con micrófono real.

Comandos y preguntas comparten una sola instancia diferida de VAD y cambian entre perfiles de 500 ms y 1000 ms de gracia. El cambio de dueño invalida callbacks anteriores antes de pausar o reiniciar la captura. Al apagar o salir se destruyen stream, nodos y runtime; un error de modelo, permiso o audio deja disponibles el STT nativo, botones y texto. `npm run voice:assets`, ejecutado también antes de desarrollo/build y después de instalar, copia el modelo, worklet y binarios ONNX fijados a `public/vendor/voice`; Vite los sirve desde el mismo origen y no se usa CDN.

«Pausar» provisional interrumpe el audio de inmediato; solo la frase definitiva solicita la transición de sesión. Una corrección o cuatro segundos sin confirmar restauran la guía desde la frase interrumpida. La confirmación de finalizar se procesa exclusivamente con resultados definitivos, después de narrar la pregunta de confirmación.

Los comandos definitivos y los botones de la práctica comparten una cola: cada acción usa el estado aplicado por la anterior. «Pausar» corta el audio al recibirse y conserva su turno para actualizar la sesión. La guía, «Repetir» y la ayuda pendientes antes de esa pausa no vuelven a iniciar audio; «Continuar» posterior puede retomarlo. La ayuda en curso mantiene suspendido el reconocimiento y los botones esperan a que termine; pulsar «Pausar» puede cortarla inmediatamente.

Si falla una acción se descartan los comandos en espera y se pide repetirlos. Al abrir la confirmación de finalizar también se descartan; cancelar la confirmación no los recupera. Salir de la pantalla invalida la acción local en curso y vacía la cola; una petición HTTP ya enviada puede terminar, pero no inicia otras acciones de esa cola. Se admiten diez comandos entre ejecución y espera, más un lugar reservado para «Pausar»; al llenarse se muestra un aviso para repetir el comando. Repetir intencionalmente una frase crea otra acción; un mismo resultado definitivo del reconocedor se procesa una vez.

El recuadro de voz utiliza un icono de micrófono. La detección y la confirmación aparecen a la altura de su estado, resaltadas en rosa. Las acciones aplicadas se confirman en texto y voz: «Tomemos un break.», «Continuemos con la práctica.», «Voy a repetir las instrucciones.», «Pasemos al siguiente paso.» y «Regresemos al paso anterior.». La escucha se suspende durante la confirmación y la guía espera a que termine. El icono se ilumina de forma intermitente al confirmar comandos y al responder la IA; su respuesta aparece progresivamente en texto durante la reproducción. Si el audio falla, el texto permanece disponible. Las preferencias de movimiento reducido desactivan la intermitencia y muestran la respuesta completa.

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

El adaptador continuo pide una finalización graciosa cuando `endpoint` está activo y existe un candidato válido: conserva el resultado definitivo y se rearma después del fin, con una espera máxima de cinco segundos si falta el evento. En preguntas, Silero puede pedir el cierre; si ya hay texto definitivo y el navegador omite el fin después de `stop()`, se libera la captura al vencer ese mismo plazo y se conserva el texto. Un provisional nunca se envía por silencio ni por vencimiento del plazo.

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

Los eventos registran solicitud/inicio de reconocimiento, primer provisional por resultado, inicio/fin de habla, inicio/fin de audio, definitivo, cierre, cancelación y error con código. En `observe`/`endpoint` añaden disponibilidad del VAD, inicio/fin de voz, descarte corto, solicitud de cierre y fallo, sin guardar el audio. También indican comandos encolados, cola llena o frases ignoradas con motivo, sin conservar sus textos. Si deja de responder, exportar antes de recargar o reiniciar el micrófono y anotar el estado visible. La ausencia de eventos no demuestra por sí sola que el motor esté detenido. Se observa también la captura de preguntas, sin generar por ahora un resumen automático de latencia de Gemini. El baseline completo y la precisión por dispositivo siguen pendientes. El primer análisis y la medición HTTP están en [Medición HTTP y correcciones](VOICE_HTTP_FINDINGS.md).
