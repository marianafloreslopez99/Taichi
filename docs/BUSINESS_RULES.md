# Reglas de negocio

## Rutinas

- **BR-001** Una sesión pertenece a una rutina identificable.
- **BR-002** Toda rutina publicada contiene al menos un ejercicio y cada ejercicio contiene movimientos.
- **BR-021** El progreso sigue el orden de ejercicios y, dentro de cada uno, el orden de movimientos; la sesión comienza en índice cero.
- **BR-034** El catálogo muestra las rutinas por su campo `order`, del 1 al 7.

## Sesiones

- **BR-003** Una sesión nueva empieza en el primer movimiento.
- **BR-004** Una sesión en reproducción se puede pausar.
- **BR-005** Una sesión pausada no incrementa el tiempo activo ni avanza por sí sola.
- **BR-006** Una sesión completada no acepta navegación ni reanudación.
- **BR-010** Completar el último movimiento finaliza la sesión y fija `completedAt`.
- **BR-022** El tiempo mostrado suma solo segundos en estado `PLAYING`.
- **BR-023** Una sesión abandonada se elimina de memoria tras confirmar la acción.

## Navegación e instrucciones

- **BR-007** Repetir reproduce la instrucción actual sin cambiar el movimiento.
- **BR-032** Pausar cancela la guía; reanudar comienza desde la primera frase del mismo movimiento.
- **BR-033** Cambiar de movimiento, preguntar o salir cancela voz y pausas pendientes.
- **BR-008** Se puede regresar mientras la sesión está activa o pausada.
- **BR-009** No se puede navegar más allá del último movimiento; el botón final se convierte en “Finalizar práctica”.
- **BR-024** El primer movimiento no tiene anterior.
- **BR-025** Navegar a una rutina inexistente muestra una salida hacia el catálogo.

## Voz y preguntas

- **BR-011** Iniciar una pregunta cambia la sesión a `ASKING` y detiene la instrucción.
- **BR-012** Durante `ASKING`, no se reproduce una instrucción de rutina simultáneamente.
- **BR-013** La pregunta se vincula al movimiento desde el que se inició.
- **BR-014** La respuesta recibe rutina, movimiento, instrucción, nivel y pregunta.
- **BR-015** Tras la respuesta, se permanece en el mismo movimiento y el usuario elige continuar.
- **BR-016** Una transcripción vacía no se envía al LLM.
- **BR-026** Cerrar la pregunta devuelve la sesión a `PAUSED`; continuar es explícito.

## Errores

- **BR-017** Un fallo de STT no finaliza la sesión.
- **BR-018** Un fallo de LLM no finaliza la sesión.
- **BR-019** Un fallo de TTS conserva la respuesta escrita.
- **BR-020** Un proveedor se sustituye sin editar las reglas del dominio.
- **BR-027** La ausencia o denegación de micrófono se traduce en un error recuperable. El mock actual no solicita permiso.
- **BR-028** Las preguntas de dolor o lesión muestran un aviso educativo y remiten a un profesional; no ofrecen diagnóstico.
- **BR-035** La clave del proveedor LLM permanece exclusivamente en el backend.
- **BR-036** Solo se responde sobre el movimiento actual de una sesión en estado `ASKING`.
- **BR-037** Cada sesión puede solicitar como máximo cinco respuestas de IA por cada diez minutos.

## Accesibilidad

- **BR-029** Toda instrucción narrada tiene texto equivalente.
- **BR-030** Ninguna acción indispensable depende exclusivamente de voz, color o animación.
- **BR-031** Los controles deshabilitados comunican su estado semánticamente.
