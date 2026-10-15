# Control por voz y tiempos de respuesta

La práctica avanza automáticamente al terminar la narración de cada movimiento y los consejos pendientes. Las pausas entre instrucciones duran como máximo 1.5 segundos. «Siguiente» permite adelantar el cambio; «Pausar», las preguntas a IA y la ayuda detienen la narración y el avance. Al terminar el último movimiento se abre la confirmación de finalizar, que requiere una respuesta del usuario. Si falla el cambio de movimiento, se muestra un aviso y se puede reintentar con «Siguiente».

La bienvenida del catálogo solo saluda e invita a elegir una rutina. El saludo usa la zona `America/Mexico_City`: «Buenos días» de las 06:00 a las 11:59, «Buenas tardes» de las 12:00 a las 18:59 y «Buenas noches» desde las 19:00 hasta las 05:59. Se calcula al abrir la guía y al volver a escucharla. El texto muestra la sección actual; al terminar queda la invitación a seleccionar una rutina. Elegir una rutina cancela la bienvenida.

Las explicaciones se distribuyen por contexto: al iniciar la primera práctica se presentan Pausar, Continuar, Ayuda y los dos modos; al avanzar por primera vez se explican Siguiente, Anterior y Repetir; al pausar o terminar la narración de un movimiento se presentan las preguntas a IA; en el último movimiento se recuerda Finalizar; al activar Pulsar para hablar se explica su funcionamiento. Se reproducen entre instrucciones y pueden omitirse con «Omitir explicación». Las explicaciones completadas u omitidas se recuerdan en el navegador mediante `taichi.guidance.v1` en `localStorage`. Una explicación interrumpida al salir o abrir otro panel queda pendiente. Si el almacenamiento no está disponible, se recuerdan durante la práctica actual. Estos textos describen las funciones sin recitar sus respuestas de confirmación.

«Ayuda» o «Necesito ayuda» abre un diálogo y responde «¿En qué te puedo ayudar?». «Cuáles eran los comandos» muestra la lista completa por temas y reproduce una orientación breve. Los botones de movimientos, preguntas a IA, modos del micrófono y finalizar permiten escuchar solo el tema elegido; «Escuchar todos los temas» reproduce la lista completa por petición explícita. «Detener explicación» interrumpe el audio conservando el panel. Mientras se consulta la ayuda se detiene la guía del movimiento. «Continuar» cierra la ayuda y retoma la práctica; «Cerrar ayuda» vuelve al estado anterior. El botón «Ayuda» aparece en el contenedor del micrófono y abre el diálogo de ayuda, con acceso a los temas y al cambio de modo. El modo activo se muestra dentro del diálogo. El cambio también está disponible en el diálogo, incluso mientras se narra un tema. El texto inferior de recordatorio y los enlaces «Abrir ayuda» y «Ver comandos» se retiraron de la pantalla de práctica.

La práctica comienza en escucha continua y el icono permite apagar o reactivar el micrófono. «Aplica el modo Pulsar para hablar» cambia a una sola intervención por pulsación y confirma «Cambiemos a modo Pulsar para hablar.». En ese modo el icono inicia la captura y otra pulsación solicita el resultado final; después de una frase, silencio, error de conexión o cierre del reconocimiento, vuelve a esperar otra pulsación. Para regresar se pulsa el micrófono y se dice «Cambia a escucha continua», «Activa escucha continua» o «Aplica el modo Escucha continua»; la confirmación es «Cambiemos a modo Escucha continua.». Hay un límite de doce segundos por captura; «Terminar escucha» espera como máximo cinco segundos por el resultado final. Cambiar de modo, narrar ayuda o abrir un panel cancela la escucha anterior y sus temporizadores.

«Pausar» provisional interrumpe el audio de inmediato; solo la frase definitiva solicita la transición de sesión. Una corrección o cuatro segundos sin confirmar restauran la guía desde la frase interrumpida. La confirmación de finalizar se procesa exclusivamente con resultados definitivos, después de narrar la pregunta de confirmación.

El recuadro de voz utiliza un icono de micrófono. La detección y la confirmación aparecen a la altura de su estado, resaltadas en rosa. Las acciones aplicadas se confirman en texto y voz: «Tomemos un break.», «Continuemos con la práctica.», «Voy a repetir las instrucciones.», «Pasemos al siguiente paso.» y «Regresemos al paso anterior.». La escucha se suspende durante la confirmación y la guía espera a que termine. El icono se ilumina de forma intermitente al confirmar comandos y al responder la IA; su respuesta aparece progresivamente en texto durante la reproducción. Si el audio falla, el texto permanece disponible. Las preferencias de movimiento reducido desactivan la intermitencia y muestran la respuesta completa.

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
