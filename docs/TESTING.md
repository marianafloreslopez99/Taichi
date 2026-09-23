# Pruebas

`npm run test` ejecuta Vitest. Las pruebas puras de `sessionMachine` cubren inicio, avance, regreso, pausa, continuación, finalización, límites, preguntas y reloj. `questionFlow` usa implementaciones controladas para cubrir preguntas escritas, errores de LLM y fallback de TTS; se conservan pruebas del puerto STT futuro. React Testing Library verifica catálogo, recorrido básico y formulario accesible de Gemini.

Puertas de entrega: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`. Comprobación manual recomendada: recorrido completo en móvil y escritorio, navegación por teclado, simulación de pregunta, ausencia de audio y reducción de movimiento. La Fase 2 añade validación de API y seed reproducible; no se prueban credenciales ni servicios reales en CI. Para una validación local completa se ejecuta `npm run db:setup` antes de levantar el backend.
