# Gestión de estado

Una única sesión activa se comparte entre práctica y resumen mediante `SessionProvider` (`useReducer`). El catálogo y las sesiones se consultan mediante TanStack Query y la API REST. El panel de IA tiene estado local en `useVoiceInteraction`, mientras que las preguntas completadas se persisten en la sesión remota. El servidor calcula el tiempo activo al consultar o cambiar de estado; el intervalo local solo actualiza la presentación del reloj.

```mermaid
stateDiagram-v2
  [*] --> PLAYING: START
  PLAYING --> PAUSED: PAUSE
  PAUSED --> PLAYING: RESUME
  PLAYING --> ASKING: ASK
  PAUSED --> ASKING: ASK
  ASKING --> PAUSED: CLOSE_QUESTION
  PLAYING --> COMPLETED: COMPLETE en último movimiento
  PAUSED --> COMPLETED: COMPLETE en último movimiento
  COMPLETED --> [*]: CLEAR
```

`NEXT` y `PREVIOUS` solo se aceptan en reproducción o pausa y verifican límites. `COMPLETE` solo se acepta en último movimiento. `TICK` no opera en pausa, pregunta ni completado. Preguntas finalizadas se agregan con `ADD_QUESTION`, vinculadas al movimiento actual. Acciones inválidas devuelven el estado sin cambio; esto evita combinaciones de booleanos incompatibles. El estado de pregunta sigue `IDLE → LISTENING → TRANSCRIBING → THINKING → SPEAKING → COMPLETED`, con transición a `ERROR` desde cada etapa fallida. Cerrar cancela reproducción y vuelve a `PAUSED`.

El identificador opaco de la sesión se guarda en `localStorage`; recargar recupera la sesión desde la API. La Fase 6 deberá añadir cuentas, historial visible, versión de esquema y política de sincronización para varios dispositivos.

El flujo de pregunta usa `AbortController`: al cerrar o reintentar se invalida la ejecución previa antes de la siguiente llamada al proveedor. `stop()` detiene cualquier narración pendiente.
