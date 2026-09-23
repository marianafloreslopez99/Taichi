# Taichi · Un momento para volver a ti

Aplicación web de acompañamiento para practicar taichí con instrucciones visibles y narradas. Incluye la rutina “Forma básica de taichí”, compuesta por siete ejercicios y 32 movimientos persistidos en MySQL, sesiones anónimas y un recorrido simulado de pregunta por voz (STT → LLM → TTS).

## Inicio

Requiere Node.js 22.12+ y npm. Desde la raíz:

```bash
npm install
npm run dev
```

Copie `.env.example` como `.env`, configure `DATABASE_URL` con una base MySQL y ejecute:

```bash
npm run db:setup
```

Este comando aplica las migraciones versionadas y carga las rutinas iniciales. El backend se inicia con `npm run dev:server` y Vite reenvía `/api` hacia él.

El inventario de dependencias está en [requirements.txt](requirements.txt). Para una instalación exacta usa `package-lock.json`; `requirements.txt` sirve como referencia y como lista de futuras incorporaciones, ya que npm no instala directamente desde archivos `.txt`.

Abra la URL indicada por Vite. Para verificar: `npm run typecheck`, `npm run lint`, `npm run test` y `npm run build`. `npm run format` aplica Prettier.

## Alcance

Puede elegir una rutina, recorrer sus ejercicios y movimientos, pausar, repetir la guía, realizar una pregunta simulada y consultar el resumen. Al reanudar, la narración comienza desde la primera frase del movimiento actual. La instrucción siempre está disponible como texto si el audio falla. Las sesiones anónimas sobreviven a una recarga mediante un identificador opaco guardado en `localStorage`.

No se conectan servicios de IA, cuentas ni cámara. La aplicación es educativa y no da diagnósticos médicos. Ante dolor o lesión, detenga la práctica y consulte a un profesional.

## Stack y organización

React, TypeScript estricto, Vite, React Router, CSS organizado por tokens/base/componentes/páginas, Vitest, React Testing Library, ESLint y Prettier. `src/domain` contiene reglas puras; `src/application` define contratos y el flujo de preguntas; `src/infrastructure` contiene datos y adaptadores mock; `src/presentation` contiene React. Consulte [la documentación técnica](docs/README.md) para decisiones, modelos, transiciones, pruebas y fases futuras.

## Próximas integraciones

STT/LLM/TTS reales, cuentas e historial, y reconocimiento de postura son fases futuras documentadas en [ROADMAP.md](docs/ROADMAP.md).
