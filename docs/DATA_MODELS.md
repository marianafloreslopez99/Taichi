# Modelos de datos

Las interfaces de dominio viven en `src/domain/models.ts`; la persistencia PostgreSQL está definida en `prisma/schema.prisma`. IDs son cadenas estables; fechas se intercambian con la API como marcas de tiempo numéricas. Las duraciones de movimiento/rutina están en segundos/minutos respectivamente, según nombre del campo.

| Modelo            | Campos                                                                                         | Invariantes                              |
| ----------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `Movement`        | id, order, name, description, instruction, durationSeconds, tips, visual                       | orden positivo, instrucción visible      |
| `Routine`         | id, name, description, difficulty, estimatedMinutes, movements, category                       | movimientos no vacíos                    |
| `PracticeSession` | id, routineId, currentMovementIndex, status, startedAt, completedAt, elapsedSeconds, questions | índice dentro de la rutina               |
| `AIQuestion`      | id, sessionId, movementId, question, answer, createdAt                                         | pertenece al movimiento en que se inició |

`Difficulty` es unión `Principiante | Intermedio`; `SessionStatus` es unión `PLAYING | PAUSED | ASKING | COMPLETED`. No se guarda estado `IDLE`: ausencia de sesión lo representa. `PREPARING` es ruta previa a crear la sesión. `AIInteractionStatus` cubre `IDLE | LISTENING | TRANSCRIBING | THINKING | SPEAKING | ERROR | COMPLETED` y pertenece al hook de presentación, pues describe avance de una interacción concreta.

Las rutinas mock están en `src/infrastructure/routines.ts`. Al introducir API real se validarán sus datos antes de crear sesiones; el dominio presupone rutinas válidas provistas por el repositorio.
