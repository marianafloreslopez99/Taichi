# API REST

Base: `/api/v1`. Todas las respuestas exitosas usan `{ "data": ... }`; los errores usan `{ "error": { "code", "message", "details?" } }`. Las respuestas de la API declaran `Cache-Control: no-store`.

## Rutinas y sesiones

- `GET /routines`: lista rutinas publicadas por `order`.
- `GET /routines/:routineId`: devuelve una rutina publicada.
- `POST /sessions`: crea una sesión con `{ "routineId", "replaceSessionId"? }`.
- `GET /sessions/:sessionId`: recupera sesión y preguntas.
- `POST /sessions/:sessionId/{pause|resume|next|previous|ask|close-question|complete}`: aplica una transición válida.
- `DELETE /sessions/:sessionId`: abandona y elimina la sesión.

## Pregunta contextual

`POST /sessions/:sessionId/questions`

```json
{
  "movementId": "pp-apertura",
  "question": "¿Cómo coordino la respiración?"
}
```

El servidor exige una sesión en `ASKING`, verifica que `movementId` sea el movimiento actual, reconstruye rutina e instrucción desde MySQL, consulta Gemini y persiste la respuesta del proveedor. El cliente no puede enviar el campo `answer`.

```json
{
  "data": {
    "text": "Respira con calma y sin forzar el ritmo.",
    "requiresProfessionalAdvice": false
  }
}
```

Errores relevantes: `INVALID_PARAMETERS` (400), `INVALID_SESSION_TRANSITION` (409), `AI_RATE_LIMITED` (429), `AI_NOT_CONFIGURED` (503), `AI_TIMEOUT` (504) y `AI_PROVIDER_ERROR` (502).

## Operación

Variables: `DATABASE_URL`, `GEMINI_API_KEY` (o `API_KEY` por compatibilidad), `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`, `PORT` y `NODE_ENV`. Para un despliegue público con usuarios identificados todavía se requiere la fase de autenticación e historial; las sesiones actuales funcionan como recursos anónimos identificados por UUID.
