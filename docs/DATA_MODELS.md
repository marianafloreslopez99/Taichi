# Modelos de datos

Las interfaces de dominio viven en `src/domain/models.ts`; la persistencia MySQL está definida en `prisma/schema.prisma`. IDs son cadenas estables; fechas se intercambian con la API como marcas de tiempo numéricas. Las duraciones de movimiento/rutina están en segundos/minutos respectivamente, según nombre del campo.

| Modelo            | Campos                                                                                         | Invariantes                              |
| ----------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `Routine`         | id, name, description, difficulty, estimatedMinutes, category, exercises                       | ejercicios no vacíos y ordenados         |
| `Exercise`        | id, order, name, description, difficulty, estimatedMinutes, category, movements                | movimientos no vacíos y ordenados        |
| `Movement`        | id, order, name, description, instruction, durationSeconds, voiceGuide, tips, image            | orden positivo, instrucción visible      |
| `VoiceCue`        | text, pauseAfterMs                                                                             | texto no vacío, pausa entre 0 y 30 s     |
| `PracticeSession` | id, routineId, currentMovementIndex, status, startedAt, completedAt, elapsedSeconds, questions | índice dentro de la rutina               |
| `AIQuestion`      | id, sessionId, movementId, question, answer, createdAt                                         | pertenece al movimiento en que se inició |

`RoutineExercise` permite ordenar y reutilizar ejercicios. La sesión conserva un índice sobre la secuencia aplanada de movimientos: primero orden de ejercicio y después orden de movimiento. `image` es una clave estable para imágenes futuras; mientras no exista un recurso, la UI muestra el visual genérico.

`Difficulty` es unión `Principiante | Intermedio`; `SessionStatus` es unión `PLAYING | PAUSED | ASKING | COMPLETED`. No se guarda estado `IDLE`: ausencia de sesión lo representa. `PREPARING` es ruta previa a crear la sesión. `AIInteractionStatus` cubre `IDLE | LISTENING | TRANSCRIBING | THINKING | SPEAKING | ERROR | COMPLETED` y pertenece al hook de presentación, pues describe avance de una interacción concreta.

El contenido fuente vive en `src/content/routines/*.json` y se valida estrictamente con Zod antes del seed. PostgreSQL y la API son la fuente de lectura de catálogo, práctica y resumen.
