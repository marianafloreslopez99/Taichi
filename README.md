# Taichi · Un momento para volver a ti

Aplicación web de acompañamiento para practicar taichí con instrucciones visibles y narradas. Incluye siete rutinas ordenadas por grupo, con 32 movimientos persistidos en MySQL, sesiones anónimas y preguntas escritas contextuales respondidas por Gemini 3.5 Flash y narradas por el navegador.

## Inicio

Requiere Node.js 22.12+ y npm. Desde la raíz:

```bash
npm install
npm run dev
```

Copie `.env.example` como `.env`, configure `DATABASE_URL` con una base MySQL y `GEMINI_API_KEY` con una clave de Gemini, y ejecute:

```bash
npm run db:setup
```

Este comando aplica las migraciones versionadas y carga las rutinas iniciales. El backend se inicia con `npm run dev:server` y Vite reenvía `/api` hacia él.

El inventario de dependencias está en [requirements.txt](requirements.txt). Para una instalación exacta usa `package-lock.json`; `requirements.txt` sirve como referencia y como lista de futuras incorporaciones, ya que npm no instala directamente desde archivos `.txt`.

Abra la URL indicada por Vite. Para verificar: `npm run typecheck`, `npm run lint`, `npm run test` y `npm run build`. `npm run format` aplica Prettier.

## Alcance

Puede elegir entre siete rutinas, recorrer sus movimientos, pausar, repetir la guía, realizar una pregunta contextual a Gemini y consultar el resumen. Al reanudar, la narración comienza desde la primera frase del movimiento actual. La instrucción siempre está disponible como texto si el audio falla. Las sesiones anónimas sobreviven a una recarga mediante un identificador opaco guardado en `localStorage`.

La clave de Gemini, el contexto confiable y la persistencia de respuestas permanecen en el backend; nunca se exponen al navegador. La entrada actual es escrita y no hay cuentas ni cámara. La aplicación es educativa y no da diagnósticos médicos. Ante dolor o lesión, detenga la práctica y consulte a un profesional.

## Stack y organización

React, TypeScript estricto, Vite, React Router, Express, Prisma, MySQL, Google Gen AI SDK, Vitest, React Testing Library, ESLint y Prettier. `src/domain` contiene reglas puras; `src/application` define contratos y el flujo de preguntas; `src/infrastructure` contiene el cliente API y adaptadores; `src/presentation` contiene React. Consulte [la documentación técnica](docs/README.md) para decisiones, modelos, transiciones, pruebas y fases futuras.

## Próximas integraciones

STT y TTS de proveedor, cuentas e historial, y reconocimiento de postura son fases futuras documentadas en [ROADMAP.md](docs/ROADMAP.md).
