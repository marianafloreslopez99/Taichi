# Medición HTTP y correcciones del control por voz

Fecha: 14 de octubre de 2026. El usuario autorizó resolver y medir las deudas de instrumentación y demora de acciones antes de Silero.

## Cambios y medición

Se añadió `Server-Timing` a las transiciones de sesión en desarrollo: total, lectura, escritura y conteo de movimientos. El cliente separa HTTP completo, recepción de cabeceras y lectura/parseo del cuerpo. Las etapas de una petición comparten `requestId` y estado HTTP, sin registrar URLs, identificadores de sesión ni cuerpos. El servidor no añade estos headers en producción.

El ensayo usó el proxy de Vite y una sesión temporal propia por ejecución, eliminada al terminar. No usó micrófono, Gemini ni la sesión de práctica del usuario. Se midieron dos ciclos secuenciales antes y después, sin cola concurrente:

| Acción    | Antes, media (ms) | Después, media (ms) | Reducción observada |
| --------- | ----------------: | ------------------: | ------------------: |
| Pausar    |            3184,9 |              1551,6 |              51,3 % |
| Continuar |            1644,7 |              1278,8 |              22,2 % |
| Siguiente |            2840,7 |              1559,4 |              45,1 % |
| Anterior  |            2744,4 |              1269,6 |              53,7 % |

Datos: [Antes](VOICE_HTTP_BEFORE.json) y [Después](VOICE_HTTP_AFTER.json). Reproducir con `node scripts/measure-session-latency.mjs salida.json 2`, con ambos servidores iniciados. La primera acción de cada ejecución incluye más coste de conexión. Dos muestras por acción son una comparación exploratoria, no percentiles ni garantía de mejora general.

La escritura intermedia del tiempo de práctica costaba aproximadamente 1,09–1,44 s en las acciones en reproducción. Se eliminó, integrando el tiempo en la escritura final de la transición. El conteo de movimientos solo se realiza para avanzar, que verifica el límite superior; retroceder valida el índice actual sin ese conteo. Además, la lectura de validación ya no consulta el historial de preguntas: la escritura final sigue devolviéndolo actualizado. Se conservan estados permitidos, confirmación de finalizar y cálculo del tiempo pausado. Una transición rechazada tampoco escribe el tiempo antes de fallar. La medición de la primera pasada, antes de eliminar esa lectura de preguntas, se conserva en [Primera pasada](VOICE_HTTP_AFTER_FIRST_PASS.json).

Persisten 1,26–1,82 s en las ocho mediciones posteriores: lectura de sesión de 179–358 ms y escritura final de 1076–1454 ms. Fuera de las etapas del servidor quedan pocos ms en este ensayo local. Una comprobación separada de `/health` (`SELECT 1`) midió 586,0 ms en la primera petición y 185,7/186,7 ms en las siguientes. La configuración apunta a un host externo o de red; no se expusieron su dirección ni credenciales. Esto localiza el coste en el camino de base de datos, sin separar red, motor y transacciones internas de Prisma.

## Instrumentación y pérdida de escucha

El formato de evaluación pasa a versión 2. El resumen separa comandos, origen de reconocimiento y origen de corte. El resultado definitivo ya no añade un segundo corte cuando el provisional de la misma captura/resultado mantiene la pausa. `audioStopBasis` distingue `interim`, `final` y `button`. Las pruebas cubren provisional seguido del definitivo en la misma posición y otra pausa posterior legítima.

Se añaden eventos de inicio/fin de audio, inicio de habla, códigos de error, comandos encolados, cola llena y frases ignoradas con motivo. No se guardan los textos. Permiten investigar si el navegador dejó de entregar resultados o si una frase recibida no coincidió con un comando. No se añadió reinicio por inactividad: silencio legítimo y captura bloqueada no se distinguen con el registro inicial.

El usuario dijo varios comandos rápidamente y luego dejó de obtener reconocimiento. Cree que seguía mostrando «Micrófono atento» y recuerda un aviso de límite de API al preguntar. No confirmó intentos totales. El JSON inicial termina en el segmento 3:7 sin eventos posteriores de fin/error; no incluye preguntas ni sus respuestas HTTP. Falta reproducir el fallo con las nuevas señales.

El usuario confirmó el aviso «Gemini alcanzó temporalmente su límite de solicitudes. Inténtalo de nuevo en un momento.». Corresponde a la rama que clasifica un HTTP 429 de Gemini sin detectar la firma de cuota diaria. No es el límite propio de Taichi de cinco preguntas por sesión en diez minutos. El mensaje por sí solo no aporta el plazo de reintento ni el detalle de cuota del proveedor. No explica por sí solo la pérdida de comandos, cuyo camino no llama a Gemini. Una prueba con cuota diaria simulada verifica que «Continuar» cierra el panel y devuelve los comandos de rutina, sin reenviar la pregunta ni consumir Gemini.

## Pendientes que requieren decisión o datos

- Repetir el ensayo acústico con hasta 30 intentos separados; si vuelve a fallar, exportar inmediatamente antes de recargar o reiniciar el micrófono, indicando cuántos intentos se hicieron.
- Consultar antes de cambiar ubicación/conexión de base de datos, reestructurar persistencia o introducir una interfaz optimista: la demora residual de actualizaciones sigue siendo significativa.
- Mantener Silero pendiente hasta resolver estas decisiones y comprobar la recuperación de escucha real.
