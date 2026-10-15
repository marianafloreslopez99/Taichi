// Set this before Vite loads .env so backend development settings cannot turn
// a frontend production build into a development build.
process.env.NODE_ENV = 'production'

const { build } = await import('vite')
await build()
