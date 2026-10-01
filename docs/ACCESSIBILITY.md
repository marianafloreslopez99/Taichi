# Accesibilidad

La estructura usa encabezados jerárquicos, navegación semántica, controles `<button>` y estados `disabled`. Los iconos decorativos se ocultan a lectores de pantalla; los controles con icono reciben nombre accesible. Un enlace “Saltar al contenido” permite evitar la navegación. El panel de preguntas usa `role="dialog"`, título asociado, botón de cierre y foco inicial; al cerrarlo el foco regresa al disparador.

El progreso incluye texto además de barra y los mensajes de estado tienen `aria-live`. Un indicador textual muestra si el micrófono escucha, reconecta o necesita permiso; se puede apagar o reactivar. Instrucciones y respuestas están siempre impresas; el audio es opcional. Los botones de práctica tienen áreas grandes para uso a distancia y forman una barra fija en móvil. El foco visible contrasta con fondos crema, verde y arcilla. Las animaciones de entrada/escucha se desactivan con `prefers-reduced-motion: reduce`.

Limitaciones a revisar con usuarios: comprensión de las indicaciones de movimiento, lectura a distancia en distintos dispositivos, voces y pronunciación del navegador, y ergonomía de teclas durante una práctica física. El navegador solicita permiso para el micrófono; la pregunta escrita permite continuar si el reconocimiento no está disponible.
