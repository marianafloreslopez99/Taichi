# Estructura del proyecto

```text
src/
  app/                 router, contexto de sesión y composición de servicios
  domain/              modelos y máquina de sesión pura
  application/         puertos y orquestación de pregunta
  infrastructure/      rutinas y adaptadores mock
server/                API Express, Prisma, validación y seed
prisma/                esquema y migraciones MySQL
  presentation/        páginas, componentes y hooks
  styles/              tokens, base, componentes y páginas
  test/                configuración de pruebas de interfaz
docs/                  documentación de producto y técnica
requirements.txt       inventario humano de dependencias actuales y futuras
```

Se simplificó la estructura de referencia: no hay carpetas vacías para cada entidad ni repositorio genérico de rutinas, porque tres rutinas locales no lo requieren. Los límites más valiosos son la máquina de sesión y los puertos de IA. `app` compone dependencias y enlaza rutas; los componentes reciben datos y callbacks. Los tests de dominio residen junto al motor para detectar regresiones de reglas; los de aplicación prueban fallos de STT/LLM/TTS.

Convención: nombres PascalCase para componentes, camelCase para hooks/funciones, TypeScript estricto y estilos CSS centralizados. El backend mantiene validación HTTP, repositorios Prisma y transiciones de sesión fuera de React.
