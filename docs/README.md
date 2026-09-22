# Documentación técnica

Taichi es una aplicación educativa para guiar rutinas de movimiento con apoyo de voz. La Fase 2 añade un backend Express, MySQL y sesiones anónimas persistentes. La voz del navegador lee instrucciones cuando está disponible; los adaptadores de IA siguen simulando STT, respuesta y TTS con retrasos visibles. La transcripción de ejemplo aparece como texto y nunca se captura audio del micrófono en esta fase.

## Mapa de lectura

- [Arquitectura](ARCHITECTURE.md): capas, dependencias y decisiones.
- [Reglas de negocio](BUSINESS_RULES.md): invariantes con identificadores.
- [Flujos de usuario](USER_FLOWS.md): práctica, preguntas y errores.
- [Integración de IA](AI_INTEGRATION.md): contratos y sustitución de adaptadores.
- [Sistema visual](DESIGN_SYSTEM.md): tokens y uso 60/30/10.
- [Modelos](DATA_MODELS.md), [estructura](PROJECT_STRUCTURE.md) y [estado](STATE_MANAGEMENT.md).
- [Accesibilidad](ACCESSIBILITY.md), [pruebas](TESTING.md) y [roadmap](ROADMAP.md).

## Operación

Node.js 22.12+; `npm install`, `npm run dev` para desarrollo. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` verifican la entrega. El navegador necesita habilitar JavaScript. La reproducción mediante `speechSynthesis` depende del soporte y configuración local; el texto conserva la experiencia cuando falla.

## Alcance actual y futuro

Hoy: catálogo desde API, tres rutinas seed, sesión persistente con controles, pregunta simulada, resumen y diseño adaptable. Luego: APIs de voz/LLM y, con consentimiento separado, cámara. No hay procesamiento médico ni estimación de postura en el MVP.
