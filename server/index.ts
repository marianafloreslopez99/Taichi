import { createApp } from './app.js'
import { env } from './config.js'

if (!env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria para iniciar el servidor.')

const app = createApp()
const server = app.listen(env.PORT, () => {
  console.log(`Taichi API escuchando en http://localhost:${env.PORT}`)
})

async function shutdown() {
  server.close()
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
