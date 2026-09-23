# Estructura del proyecto

```text
src/
  app/                 router, contexto de sesión y composición de servicios
  content/             JSON de rutinas y validación estricta de contenido
  domain/              modelos y máquina de sesión pura
  application/         puertos y orquestación de pregunta
  infrastructure/      cliente API y adaptadores de voz/IA
  presentation/        páginas, componentes y hooks
  styles/              tokens, base, componentes y páginas
  test/                configuración de pruebas de interfaz
server/                API Express, Gemini, Prisma, validación y seed
prisma/                esquema y migraciones MySQL
docs/                  documentación de producto y técnica
requirements.txt       inventario humano de dependencias actuales y futuras
```

La jerarquía de contenido es rutina → ejercicios reutilizables → movimientos. Los JSON se validan antes de llegar al seed; la API y MySQL son la única fuente de lectura de la aplicación. Los límites más valiosos son la máquina de sesión y los puertos de IA. `app` compone dependencias y enlaza rutas; los componentes reciben datos y callbacks.

Convención: nombres PascalCase para componentes, camelCase para hooks/funciones, TypeScript estricto y estilos CSS centralizados. El backend mantiene validación HTTP, repositorios Prisma y transiciones de sesión fuera de React.
