# Primera muestra de control por voz en Edge

Evaluación del usuario: 14 de octubre de 2026, 19:17:47–19:19:20, America/Mexico_City. Duración: 92,425 segundos. Fuente: JSON exportado por `taichiVoiceDiagnostics`, `schemaVersion: 1`. El archivo original fue adjuntado en el chat; este documento conserva los resultados agregados, sin audio ni transcripciones.

## Condición y alcance

Metadatos declarados: Edge, escritorio principal, entorno tranquilo, altavoces y arranque caliente. Hay 49 entradas y ninguna descartada por el límite de memoria (`droppedEntries: 0`). Se registraron ocho segmentos de comando en la captura continua 3: dos pausas, dos continuaciones, dos repeticiones, un avance y un retroceso. No aparecen errores de captura ni de acción en este registro. Eso no acredita precisión del reconocimiento: falta conocer el número de intentos pronunciados y los fallos observados por el usuario.

Los ocho comandos no completan la muestra mínima de 30 intentos por condición del protocolo. Los metadatos indican arranque caliente, pero el registro también incluye dos solicitudes de captura canceladas antes de la captura 3; no se puede inferir su causa ni usarlas para medir arranque frío.

## Mediciones por segmento

Tiempos en milisegundos, redondeados a una cifra decimal. Reconocimiento mide primer resultado provisional → definitivo; no es tiempo desde el fin acústico de la voz. Ejecución comienza al salir de la cola y termina al resolverse la acción; en Repetir mide iniciar la guía, no escucharla completa.

| Segmento | Comando   | Reconocimiento | Espera en cola | Ejecución |
| -------- | --------- | -------------: | -------------: | --------: |
| 3:0      | Pausar    |          223,7 |            8,8 |    3155,1 |
| 3:1      | Continuar |          337,0 |         1564,9 |    1663,5 |
| 3:2      | Repetir   |          245,5 |            8,6 |       0,3 |
| 3:3      | Pausar    |          229,0 |            6,6 |    2769,6 |
| 3:4      | Continuar |          615,4 |          905,5 |    1674,7 |
| 3:5      | Repetir   |          318,8 |          984,7 |       0,3 |
| 3:6      | Siguiente |          198,3 |            6,3 |    2955,2 |
| 3:7      | Anterior  |          615,5 |         1374,8 |    2957,8 |

El p50 de reconocimiento es 245,5 ms y el p95, 615,5 ms. Con ocho muestras y el método de rango más próximo, p95 coincide con el máximo observado; no es una estimación robusta de cola estadística.

La cola refleja el orden solicitado: la primera continuación llegó mientras la pausa seguía en curso; comenzó 9,8 ms después de terminar esa pausa. La espera de 1564,9 ms incluye ese bloqueo por la acción anterior. Por sí sola no demuestra lentitud del planificador de React.

## Hallazgos y limitaciones

- El camino de actualización de sesión domina la demora observada en las seis acciones persistentes (1663,5–3155,1 ms). Repetir es local y tarda 0,3 ms en iniciar. Esto justifica medir cliente HTTP, servidor y operaciones de base de datos por separado antes de atribuir la causa a uno de ellos. El JSON actual no separa esas etapas.
- La revisión de `transitionSession` muestra lectura de sesión, posible escritura intermedia de tiempo, conteo de movimientos para todas las acciones y escritura final. El conteo no se usa para pausar o continuar; la escritura intermedia puede añadir otra operación. Son oportunidades de revisión, no una causa de latencia ya medida ni una modificación aplicada.
- Silero puede intervenir en el cierre de habla; no resolvería por sí solo la espera de las actualizaciones de sesión observadas aquí. No hay mediciones del último frame de voz para elegir un umbral de silencio.
- Hay tres mediciones `audio-stop` para dos pausas. En 3:3 se registra tanto la interrupción provisional como la definitiva, ambas de 0,2 ms. No deben contarse como tres pausas independientes. Es necesario distinguir el origen del corte o registrar solo el primero al resumir la respuesta por intervención.
- Los cortes locales registrados son de 0,2–0,7 ms para invocar la cancelación TTS. No miden el instante en que el altavoz dejó de emitir sonido.

## Siguiente decisión

El usuario autorizó corregir y medir ambos puntos antes de Silero. El trabajo posterior está documentado en [Medición HTTP y correcciones](VOICE_HTTP_FINDINGS.md). Silero permanece pendiente; esta primera muestra de ocho comandos se conserva como referencia histórica.
