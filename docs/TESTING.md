# Pruebas

`npm run test` ejecuta Vitest. Las pruebas puras de `sessionMachine` cubren inicio, avance, regreso, pausa, continuación, finalización, límites, preguntas y reloj. `questionFlow` cubre escucha, transcripción, Gemini y respuesta hablada, incluidos fallos y cancelación. El adaptador del navegador se prueba con reconocimiento simulado. React Testing Library verifica catálogo, recorrido por voz y formulario de texto accesible.

Puertas de entrega: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`. Comprobación manual recomendada: recorrido completo en móvil y escritorio, navegación por teclado, simulación de pregunta, ausencia de audio y reducción de movimiento. La Fase 2 añade validación de API y seed reproducible; no se prueban credenciales ni servicios reales en CI. Para una validación local completa se ejecuta `npm run db:setup` antes de levantar el backend.
