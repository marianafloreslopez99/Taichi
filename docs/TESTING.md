# Pruebas

`npm run test` ejecuta Vitest. Las pruebas puras de `sessionMachine` cubren inicio, avance, regreso, pausa, continuación, finalización, límites, preguntas y el reloj. `questionFlow` usa implementaciones controladas de los puertos para cubrir recorrido y errores de STT, LLM y TTS. React Testing Library verifica el catálogo remoto y la interacción básica visible, sin duplicar todas las reglas ya cubiertas por el dominio.

Puertas de entrega: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`. Comprobación manual recomendada: recorrido completo en móvil y escritorio, navegación por teclado, simulación de pregunta, ausencia de audio y reducción de movimiento. La Fase 2 añade validación de API y seed reproducible; no se prueban credenciales ni servicios reales en CI. Para una validación local completa se ejecuta `npm run db:setup` antes de levantar el backend.
