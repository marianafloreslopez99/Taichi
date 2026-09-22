# Sistema visual

Dirección: interfaz cálida, viva y serena, pensada para adultos mayores. Usa fondos luminosos, verde accesible y naranja para las acciones importantes. La composición deja aire alrededor de los movimientos y reserva la densidad visual para el catálogo. El motivo de círculos concéntricos evoca respiración y continuidad, sin pretender enseñar la postura por sí solo.

## Proporción y tokens

Los tokens viven en `src/styles/tokens.css` y son la única fuente de hexadecimales en estilos. **60 %** `#FFF8E8` para lienzo y superficie principal; **30 %** `#D9F3DF` para paneles y cards; **10 %** `#D65A2D` para llamadas a la acción, micrófono y progreso. Variantes oscuras y tintes se derivan para asegurar contraste.

Tipografía: serif expresiva para títulos, sans legible para interfaz. Escala fluida para titulares, cuerpo de 18 px o más e instrucciones de práctica grandes. Botones principales usan texto de 17–19 px y áreas táctiles amplias. Espaciado base de 4 px con pasos `--space-1` a `--space-12`. Radios suaves de 12, 20, 28 px y forma circular. Sombras muy ligeras. Puntos de adaptación: 640 px y 960 px; se empieza en una sola columna.

Botones: `primary` arcilla para avanzar/iniciar, `secondary` verde profundo, `ghost` claro para acciones auxiliares. Cards: básica sobre crema, destacada verde tenue. Deshabilitado reduce presencia y usa `disabled` real; error tiene texto e icono, éxito tiene confirmación escrita. `:focus-visible` usa anillo de alto contraste. La animación suaviza entrada, progreso y escucha, con `prefers-reduced-motion` para desactivarla.
