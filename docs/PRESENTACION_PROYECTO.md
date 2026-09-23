# Presentación técnica del proyecto Taichi

## 1. ¿Qué es el proyecto?

Taichi es una aplicación web educativa que acompaña a una persona durante una práctica guiada de taichí. La aplicación permite elegir una rutina, avanzar movimiento por movimiento, escuchar instrucciones, pausar la sesión y hacer preguntas contextuales a Gemini sin abandonar la práctica.

El proyecto ya cuenta con:

- siete rutinas organizadas por grupo de movimientos;
- 32 movimientos definidos mediante archivos JSON;
- sesiones persistentes en MySQL;
- controles de reproducción, pausa, navegación y finalización;
- guía hablada mediante la síntesis de voz del navegador;
- preguntas escritas respondidas por Gemini 3.5 Flash;
- almacenamiento de cada pregunta y respuesta;
- resumen final de la práctica;
- validaciones, manejo de errores y pruebas automatizadas.

Las referencias del campo `image` todavía son identificadores para imágenes futuras. Actualmente la aplicación muestra un recurso visual temporal asociado al movimiento.

## 2. Experiencia disponible para el usuario

El recorrido actual es el siguiente:

1. La persona abre el catálogo de rutinas.
2. Selecciona uno de los siete grupos.
3. La API crea una sesión persistente.
4. La pantalla presenta el movimiento actual, su instrucción y progreso.
5. La guía se reproduce por voz cuando el navegador lo permite.
6. La persona puede pausar, repetir, regresar o avanzar.
7. Puede detenerse en ese movimiento y escribir una pregunta.
8. El servidor agrega el contexto correcto y consulta Gemini.
9. La respuesta se muestra, se lee en voz alta y se guarda en MySQL.
10. Al finalizar se presenta el resumen de la sesión.

```mermaid
flowchart LR
  A[Catálogo de rutinas] --> B[Crear sesión]
  B --> C[Movimiento actual]
  C --> D{Acción del usuario}
  D -->|Pausar o navegar| C
  D -->|Preguntar| E[Gemini 3.5 Flash]
  E --> F[Guardar pregunta y respuesta]
  F --> C
  D -->|Último movimiento| G[Resumen]
```

## 3. Rutinas disponibles

Las rutinas se encuentran en [`src/content/routines/`](../src/content/routines/). Cada archivo representa un grupo independiente:

| Orden | Archivo                             | Rutina                         |
| ----: | ----------------------------------- | ------------------------------ |
|     1 | `01-primeros-movimientos.json`      | Primeros movimientos           |
|     2 | `02-brazos-coordinacion.json`       | Brazos y coordinación          |
|     3 | `03-cambio-peso.json`               | Cambio de peso                 |
|     4 | `04-pasos-movimientos-piernas.json` | Pasos y movimientos de piernas |
|     5 | `05-brazos-piernas.json`            | Brazos y piernas               |
|     6 | `06-forma-completa-taichi.json`     | Forma completa de taichí       |
|     7 | `07-repaso-forma.json`              | Repaso de la forma             |

Un movimiento se describe con contenido, duración, guía de voz, referencia visual y consejos. Por ejemplo, en [`01-primeros-movimientos.json`](../src/content/routines/01-primeros-movimientos.json):

```json
{
  "id": "pp-apertura",
  "order": 1,
  "name": "Apertura",
  "instruction": "Coloca los pies separados y mantén una postura cómoda...",
  "durationSeconds": 120,
  "voiceGuide": [
    {
      "text": "Coloca los pies separados y adopta una postura cómoda.",
      "pauseAfterMs": 3000
    }
  ],
  "image": "opening",
  "tips": ["Mantén los hombros relajados."]
}
```

### Validación del contenido

[`src/content/routineContent.ts`](../src/content/routineContent.ts) importa los siete JSON y los valida con Zod antes de utilizarlos:

```ts
export const routines: Routine[] = routineCollectionSchema.parse([
  primerosMovimientos,
  brazosCoordinacion,
  cambioPeso,
  pasosMovimientosPiernas,
  brazosPiernas,
  formaCompletaTaichi,
  repasoForma,
])
```

Esta validación comprueba, entre otras reglas:

- identificadores con formato uniforme;
- identificadores únicos entre rutinas y movimientos;
- órdenes consecutivos desde 1;
- duración calculada a partir de los movimientos;
- textos y arreglos obligatorios;
- una o más indicaciones de voz por movimiento.

## 4. Arquitectura

La aplicación está separada por responsabilidades:

```mermaid
flowchart TB
  UI[React: páginas y componentes]
  APP[Aplicación: flujos y contratos]
  DOMAIN[Dominio: modelos y reglas]
  CLIENT[Adaptadores HTTP y voz]
  API[Express API]
  ORM[Prisma ORM]
  DB[(MySQL)]
  AI[Gemini 3.5 Flash]

  UI --> APP
  UI --> DOMAIN
  APP --> CLIENT
  CLIENT --> API
  API --> ORM
  ORM --> DB
  API --> AI
```

| Capa                    | Responsabilidad                                          | Ubicación principal     |
| ----------------------- | -------------------------------------------------------- | ----------------------- |
| Presentación            | Pantallas, controles, modal de preguntas y accesibilidad | `src/presentation/`     |
| Aplicación              | Coordinar pregunta, IA y narración                       | `src/application/`      |
| Dominio                 | Modelos, estados y reglas de sesión                      | `src/domain/`           |
| Infraestructura cliente | Comunicación con la API y adaptadores de voz/IA          | `src/infrastructure/`   |
| API                     | Endpoints, validación y errores HTTP                     | `server/`               |
| Persistencia            | Tablas, relaciones y migraciones                         | `prisma/`               |
| Contenido               | Rutinas fuente en JSON                                   | `src/content/routines/` |

En desarrollo, [`vite.config.ts`](../vite.config.ts) redirige `/api` hacia `http://localhost:3000`, por lo que la API key nunca necesita llegar al navegador.

## 5. Persistencia con MySQL y Prisma

El modelo de datos se encuentra en [`prisma/schema.prisma`](../prisma/schema.prisma).

```prisma
model Session {
  id                   String        @id
  routineId            String
  currentMovementIndex Int           @default(0)
  status               SessionStatus @default(PLAYING)
  elapsedSeconds       Int           @default(0)
  routine              Routine       @relation(fields: [routineId], references: [id])
  questions            AIQuestion[]
}

model AIQuestion {
  id         String   @id
  sessionId  String
  movementId String
  question   String   @db.Text
  answer     String   @db.Text
  createdAt  DateTime @default(now())
}
```

Las entidades principales son:

- `Routine`: datos generales de una rutina publicada;
- `Exercise`: grupo que contiene movimientos;
- `Movement`: instrucción individual, duración, voz, consejos e imagen;
- `Session`: estado y progreso de una práctica;
- `AIQuestion`: pregunta y respuesta asociadas a sesión y movimiento.

[`server/seed.ts`](../server/seed.ts) sincroniza los JSON con MySQL usando operaciones `upsert`. Esto permite actualizar contenido sin duplicar registros:

```ts
await prisma.movement.upsert({
  where: { id: movement.id },
  update: {
    instruction: movement.instruction,
    voiceGuide,
    tips: movement.tips,
  },
  create: { id: movement.id, exerciseId: exercise.id /* ... */ },
})
```

## 6. Control y persistencia de la práctica

Una sesión puede tener cuatro estados, definidos en [`src/domain/models.ts`](../src/domain/models.ts):

```ts
export type SessionStatus = 'PLAYING' | 'PAUSED' | 'ASKING' | 'COMPLETED'
```

Las transiciones se validan en el dominio y nuevamente en el servidor. Por ejemplo, [`src/domain/sessionMachine.ts`](../src/domain/sessionMachine.ts) sólo abre el asistente desde una sesión reproducida o pausada:

```ts
case 'ASK':
  return canNavigate(session)
    ? { ...session, status: 'ASKING' }
    : session
```

[`src/app/SessionProvider.tsx`](../src/app/SessionProvider.tsx) conecta React con la API. Guarda únicamente el identificador de sesión en `localStorage`; el estado oficial se conserva en MySQL:

```ts
const remoteSession = await api.createSession(
  routine.id,
  window.localStorage.getItem('taichi.sessionId') ?? undefined,
)
window.localStorage.setItem('taichi.sessionId', remoteSession.id)
dispatch({ type: 'HYDRATE', session: remoteSession })
```

Si se recarga la página, la aplicación recupera la sesión mediante `GET /sessions/:sessionId`.

## 7. Pantalla de práctica y guía de voz

La experiencia principal está implementada en [`src/presentation/pages/PracticePage.tsx`](../src/presentation/pages/PracticePage.tsx).

La página:

- obtiene la rutina desde la API;
- localiza el movimiento usando `currentMovementIndex`;
- muestra progreso, tiempo e instrucción;
- reproduce la guía del movimiento;
- permite repetir, pausar y navegar;
- abre el panel contextual de Gemini;
- finaliza solamente desde el último movimiento.

```tsx
<PracticeControls
  isPaused={session.status === 'PAUSED'}
  isFirst={session.currentMovementIndex === 0}
  isLast={session.currentMovementIndex === steps.length - 1}
  onRepeat={startNarration}
  onNext={next}
/>
```

La narración usa `speechSynthesis` del navegador mediante [`src/infrastructure/ai/mockAdapters.ts`](../src/infrastructure/ai/mockAdapters.ts). La voz está configurada en español de México y a una velocidad reducida:

```ts
const utterance = new SpeechSynthesisUtterance(text)
utterance.lang = 'es-MX'
utterance.rate = 0.88
window.speechSynthesis.speak(utterance)
```

Si la reproducción falla, la instrucción escrita permanece disponible. La entrada de preguntas actual es escrita; el proyecto conserva contratos para una futura integración de reconocimiento de voz, pero no graba el micrófono en esta fase.

## 8. API REST

La API está construida con Express en [`server/app.ts`](../server/app.ts) y utiliza la base `/api/v1`.

| Método   | Ruta                                  | Función                              |
| -------- | ------------------------------------- | ------------------------------------ |
| `GET`    | `/routines`                           | Lista rutinas publicadas             |
| `GET`    | `/routines/:routineId`                | Obtiene una rutina completa          |
| `POST`   | `/sessions`                           | Crea o reemplaza una sesión          |
| `GET`    | `/sessions/:sessionId`                | Recupera progreso y preguntas        |
| `POST`   | `/sessions/:sessionId/pause`          | Pausa la práctica                    |
| `POST`   | `/sessions/:sessionId/resume`         | Reanuda la práctica                  |
| `POST`   | `/sessions/:sessionId/next`           | Avanza un movimiento                 |
| `POST`   | `/sessions/:sessionId/previous`       | Regresa un movimiento                |
| `POST`   | `/sessions/:sessionId/ask`            | Abre el estado de pregunta           |
| `POST`   | `/sessions/:sessionId/close-question` | Cierra la pregunta                   |
| `POST`   | `/sessions/:sessionId/complete`       | Completa la práctica                 |
| `POST`   | `/sessions/:sessionId/questions`      | Genera y guarda una respuesta        |
| `DELETE` | `/sessions/:sessionId`                | Abandona la sesión                   |
| `GET`    | `/health`                             | Comprueba aplicación y base de datos |

El cliente centraliza estas llamadas en [`src/infrastructure/api/client.ts`](../src/infrastructure/api/client.ts):

```ts
createQuestion: (sessionId, movementId, question, signal) =>
  request<AIResponse>(`/sessions/${sessionId}/questions`, {
    method: 'POST',
    body: JSON.stringify({ movementId, question }),
    signal,
  })
```

## 9. Integración con Gemini 3.5 Flash

La clave de Gemini se lee exclusivamente en el servidor desde `GEMINI_API_KEY`. El modelo predeterminado se configura como `gemini-3.5-flash` en [`server/config.ts`](../server/config.ts).

Cuando llega una pregunta, el endpoint no acepta una respuesta creada por el navegador. En su lugar:

1. valida la sesión y el movimiento;
2. consulta MySQL para reconstruir el contexto oficial;
3. llama a Gemini;
4. guarda la respuesta devuelta por el proveedor;
5. entrega el resultado al navegador.

El proceso principal se encuentra en [`server/app.ts`](../server/app.ts):

```ts
const context = await getQuestionContext(
  prisma,
  sessionId,
  input.movementId,
  input.question,
)
const answer = await aiQuestionService.answer(context, controller.signal)
await addQuestion(prisma, sessionId, {
  movementId: input.movementId,
  question: input.question,
  answer: answer.text,
})
```

[`server/geminiService.ts`](../server/geminiService.ts) crea la interacción con el proveedor:

```ts
const interaction = await this.createInteraction(
  {
    model: this.model,
    input: buildQuestionPrompt(context),
    system_instruction: SYSTEM_INSTRUCTION,
    generation_config: {
      max_output_tokens: 800,
      thinking_level: 'low',
    },
    store: false,
  },
  {
    timeout_ms: env.GEMINI_TIMEOUT_MS,
    signal,
    retries: { strategy: 'none' },
  },
)
```

El modelo recibe contexto como:

```text
Rutina: Primeros movimientos
Nivel: Principiante
Movimiento: Apertura
Instrucción oficial: Coloca los pies separados...
Pregunta de la persona: ¿Cómo coordino la respiración?
```

La instrucción del sistema exige respuestas breves en español, limita el contenido al movimiento actual, rechaza intentos de cambiar las reglas y evita diagnósticos médicos.

## 10. Flujo de preguntas en la interfaz

[`src/presentation/hooks/useAIQuestion.ts`](../src/presentation/hooks/useAIQuestion.ts) administra los estados `IDLE`, `THINKING`, `SPEAKING`, `ERROR` y `COMPLETED`.

```ts
const result = await runTextQuestionFlow(
  movementContext,
  normalizedQuestion,
  voiceServices,
  updateStatus,
  receiveAnswer,
  controller.signal,
)
```

El `AbortController` cancela la petición si la persona cierra el panel. Cuando la respuesta llega:

- se presenta como texto;
- se intenta leer mediante síntesis de voz;
- se actualiza la sesión con la pregunta persistida;
- si el audio falla, el texto no se pierde;
- si Gemini falla, el formulario permite reintentar.

El formulario accesible está en [`src/presentation/components/AIQuestionPanel.tsx`](../src/presentation/components/AIQuestionPanel.tsx).

## 11. Seguridad y manejo de errores

El alcance actual incluye estas protecciones:

- la API key nunca se expone al frontend;
- los cuerpos se validan con esquemas estrictos de Zod;
- las preguntas se limitan a 2,000 caracteres;
- el servidor verifica que el movimiento sea realmente el actual;
- la respuesta guardada sólo puede provenir del proveedor;
- se permiten cinco preguntas por sesión cada diez minutos;
- la llamada a Gemini tiene timeout y cancelación;
- se desactivaron reintentos automáticos largos;
- se distinguen límite temporal y cuota diaria agotada;
- las respuestas declaran `Cache-Control: no-store`;
- Express no publica la cabecera `x-powered-by`;
- las preguntas de salud muestran una recomendación profesional.

Ejemplo de detección de cuota diaria en [`server/geminiService.ts`](../server/geminiService.ts):

```ts
if (status === 429 && DAILY_QUOTA_PATTERN.test(providerErrorMessage(error))) {
  throw new HttpError(
    429,
    'AI_DAILY_QUOTA_EXHAUSTED',
    'Se agotó la cuota diaria de Gemini para este proyecto.',
  )
}
```

## 12. Pruebas y calidad

El proyecto usa Vitest, Testing Library, ESLint y TypeScript. Actualmente existen 27 pruebas distribuidas en nueve archivos.

Las pruebas cubren:

- carga y orden de las siete rutinas;
- unicidad de identificadores y 32 movimientos;
- máquina de estados de sesión;
- pausa, reanudación, navegación y finalización;
- guía de voz y cancelación;
- formulario de preguntas;
- flujo escrito, errores y conservación del texto si falla el audio;
- adaptador HTTP hacia la API;
- contexto enviado a Gemini;
- falta de API key, límites temporales y cuota diaria;
- recorrido integrado principal de la aplicación.

Comandos de verificación:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## 13. Configuración y ejecución local

Variables requeridas o configurables en `.env`:

```dotenv
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE"
GEMINI_API_KEY="tu-api-key"
GEMINI_MODEL="gemini-3.5-flash"
GEMINI_TIMEOUT_MS=30000
PORT=3000
NODE_ENV=development
```

Preparación y ejecución:

```bash
npm install
npm run db:setup
npm run dev:server
npm run dev
```

El backend queda en `http://localhost:3000` y Vite sirve el frontend en su puerto de desarrollo.

## 14. Mapa rápido del código

```text
Taichi/
├── prisma/
│   ├── schema.prisma              # Tablas y relaciones MySQL
│   └── migrations/                # Evolución de la base de datos
├── server/
│   ├── app.ts                     # Rutas y validación HTTP
│   ├── sessionService.ts          # Reglas persistentes de sesión
│   ├── geminiService.ts           # Integración segura con Gemini
│   ├── seed.ts                    # Sincronización JSON → MySQL
│   └── config.ts                  # Variables de entorno
├── src/
│   ├── app/SessionProvider.tsx    # Estado global sincronizado
│   ├── application/               # Flujos de pregunta y narración
│   ├── content/routines/          # Siete rutinas JSON
│   ├── domain/                    # Modelos y máquina de estados
│   ├── infrastructure/            # Cliente API y adaptadores
│   └── presentation/              # Pantallas y componentes React
└── docs/                          # Documentación técnica
```

## 15. Estado actual y siguientes pasos

### Funcional actualmente

- catálogo de siete rutinas;
- práctica guiada con 32 movimientos;
- progreso y tiempo persistentes;
- navegación y recuperación después de recargar;
- guía hablada del navegador;
- preguntas reales a Gemini 3.5 Flash;
- almacenamiento de preguntas y respuestas;
- avisos de seguridad y errores recuperables;
- resumen final y diseño adaptable.

### Pendiente para una publicación abierta

- autenticación y cuentas de usuario;
- historial de prácticas por persona;
- rate limiting compartido entre varias instancias del servidor;
- observabilidad, métricas y alertas;
- imágenes definitivas para cada movimiento;
- proveedor dedicado de voz si se necesita calidad uniforme;
- despliegue automatizado y gestión de secretos;
- revisión de accesibilidad y pruebas con personas usuarias;
- política de privacidad y consentimiento antes de incorporar cámara o micrófono.

La base actual ya permite demostrar el recorrido completo: contenido estructurado, práctica persistente, acompañamiento por voz e inteligencia artificial contextual con almacenamiento seguro en el backend.
