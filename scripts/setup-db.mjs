import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import process from 'node:process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

function loadEnvFile() {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(?:"(.*)"|(.*))$/)
    if (match) process.env[match[1]] = match[2] ?? match[3]
  }
}

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env')
  console.log('Se creó .env desde .env.example')
}

const currentEnv = readFileSync('.env', 'utf8')
const configuredPort = Number(currentEnv.match(/^POSTGRES_PORT=(\d+)$/m)?.[1] ?? 5432)
const runningContainers = (() => {
  try {
    return execFileSync('docker', ['ps', '--format', '{{.Names}}\t{{.Ports}}'], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => !line.startsWith('taichi-postgres\t'))
      .join('\n')
  } catch {
    return ''
  }
})()
let postgresPort = configuredPort
while (runningContainers.includes(`:${postgresPort}->`)) postgresPort += 1

if (postgresPort !== configuredPort) {
  console.log(`El puerto ${configuredPort} está ocupado; usando ${postgresPort}.`)
  const updatedEnv = (currentEnv.match(/^POSTGRES_PORT=\d+$/m)
    ? currentEnv.replace(/^POSTGRES_PORT=\d+$/m, `POSTGRES_PORT=${postgresPort}`)
    : `${currentEnv.trim()}\nPOSTGRES_PORT=${postgresPort}\n`
  ).replace(/localhost:\d+\/taichi/, `localhost:${postgresPort}/taichi`)
  writeFileSync('.env', updatedEnv)
}
loadEnvFile()

console.log('Levantando PostgreSQL con Docker Compose…')
run('docker', ['compose', 'up', '-d', 'postgres'])

let ready = false
for (let attempt = 1; attempt <= 30; attempt += 1) {
  try {
    run('docker', ['compose', 'exec', '-T', 'postgres', 'pg_isready', '-U', 'taichi', '-d', 'taichi'])
    ready = true
    break
  } catch {
    console.log(`Esperando PostgreSQL (${attempt}/30)…`)
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

if (!ready) {
  console.error('PostgreSQL no estuvo disponible a tiempo.')
  process.exit(1)
}

console.log('Aplicando migraciones…')
run(npmCommand, ['run', 'db:migrate:deploy'])
console.log('Cargando rutinas iniciales…')
run(npmCommand, ['run', 'db:seed'])
console.log('Base de datos lista.')
