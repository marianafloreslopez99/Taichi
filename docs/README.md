# Documentación técnica

Taichi es una aplicación educativa para guiar rutinas de movimiento con apoyo de voz. El backend Express usa MySQL para sesiones anónimas persistentes y Gemini 3.5 Flash para responder preguntas escritas con el contexto del movimiento. La voz del navegador lee instrucciones y respuestas cuando está disponible; nunca se captura audio del micrófono en esta fase.

## Mapa de lectura

- [Arquitectura](ARCHITECTURE.md): capas, dependencias y decisiones.
- [Reglas de negocio](BUSINESS_RULES.md): invariantes con identificadores.
- [Flujos de usuario](USER_FLOWS.md): práctica, preguntas y errores.
- [Integración de IA](AI_INTEGRATION.md): contratos y sustitución de adaptadores.
- [API REST](API.md): endpoints, contratos, errores y configuración.
- [Sistema visual](DESIGN_SYSTEM.md): tokens y uso 60/30/10.
- [Modelos](DATA_MODELS.md), [estructura](PROJECT_STRUCTURE.md) y [estado](STATE_MANAGEMENT.md).
- [Accesibilidad](ACCESSIBILITY.md), [pruebas](TESTING.md) y [roadmap](ROADMAP.md).

## Operación

Node.js 22.12+; `npm install`, `npm run dev` para desarrollo. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` verifican la entrega. El navegador necesita habilitar JavaScript. La reproducción mediante `speechSynthesis` depende del soporte y configuración local; el texto conserva la experiencia cuando falla.

## Alcance actual y futuro

Hoy: catálogo de siete rutinas desde API, sesión persistente con controles, preguntas reales a Gemini, resumen y diseño adaptable. Luego: entrada/salida de voz de proveedor y, con consentimiento separado, cámara. No hay procesamiento médico ni estimación de postura en el MVP.
