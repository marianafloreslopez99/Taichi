import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = process.argv[2]
const cycles = Number(process.argv[3] ?? 3)
if (!output || !Number.isInteger(cycles) || cycles < 1 || cycles > 10)
  throw new Error(
    'Usage: node scripts/measure-session-latency.mjs output.json [cycles:1..10]',
  )
const base = 'http://127.0.0.1:5173/api/v1'
let sessionId
const samples = []

async function request(path, options) {
  const response = await fetch(`${base}${path}`, options)
  if (!response.ok)
    throw new Error(`HTTP ${response.status} for benchmark request`)
  return response
}

try {
  const { data: routines } = await (await request('/routines')).json()
  const { data: session } = await (
    await request('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routineId: routines[0].id }),
    })
  ).json()
  sessionId = session.id
  for (let cycle = 0; cycle < cycles; cycle++) {
    for (const action of ['pause', 'resume', 'next', 'previous']) {
      const start = performance.now()
      const response = await request(`/sessions/${sessionId}/${action}`, {
        method: 'POST',
      })
      const headersAt = performance.now()
      await response.json()
      const sample = {
        cycle: cycle + 1,
        action,
        httpMs: performance.now() - start,
        headersMs: headersAt - start,
        serverTiming: response.headers.get('Server-Timing'),
      }
      samples.push(sample)
      console.log(
        `${cycle + 1} ${action}: ${sample.httpMs.toFixed(1)} ms; ${sample.serverTiming ?? 'no server timing'}`,
      )
    }
  }
  await writeFile(
    resolve(output),
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        method:
          'Sequential HTTP via Vite proxy, disposable session, no microphone or Gemini',
        cycles,
        samples,
      },
      null,
      2,
    ) + '\n',
  )
} finally {
  if (sessionId) {
    await request(`/sessions/${sessionId}`, { method: 'DELETE' })
    console.log('Disposable benchmark session deleted.')
  }
}
