import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assets = [
  {
    source: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v6.onnx',
    target: 'public/vendor/voice/vad/silero_vad_v6.onnx',
  },
  {
    source: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
    target: 'public/vendor/voice/vad/vad.worklet.bundle.min.js',
  },
  {
    source: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
    target: 'public/vendor/voice/onnx/ort-wasm-simd-threaded.mjs',
  },
  {
    source: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
    target: 'public/vendor/voice/onnx/ort-wasm-simd-threaded.wasm',
  },
  {
    source: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
    target: 'public/vendor/voice/onnx/ort-wasm-simd-threaded.jsep.mjs',
  },
  {
    source:
      'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm',
    target: 'public/vendor/voice/onnx/ort-wasm-simd-threaded.jsep.wasm',
  },
]

for (const asset of assets) {
  const target = resolve(projectRoot, asset.target)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(resolve(projectRoot, asset.source), target)
}

console.log(`Synced ${assets.length} local voice assets.`)
