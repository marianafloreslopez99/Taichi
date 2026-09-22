export const MOCK_TIMING = {
  listening: 1200,
  transcription: 900,
  thinking: 1300,
  speakingFallback: 1100,
} as const

export const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
