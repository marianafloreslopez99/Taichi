export type SessionTimingStage =
  'db-read' | 'db-elapsed' | 'db-movement-count' | 'db-write'
export type MeasureSessionOperation = <T>(
  stage: SessionTimingStage,
  operation: () => Promise<T>,
) => Promise<T>

export function createSessionTiming() {
  const started = performance.now()
  const durations = new Map<SessionTimingStage, number>()
  const measure: MeasureSessionOperation = async (stage, operation) => {
    const start = performance.now()
    try {
      return await operation()
    } finally {
      durations.set(
        stage,
        (durations.get(stage) ?? 0) + performance.now() - start,
      )
    }
  }
  return {
    measure,
    header: () =>
      [
        `server;dur=${(performance.now() - started).toFixed(3)}`,
        ...[...durations].map(
          ([stage, duration]) => `${stage};dur=${duration.toFixed(3)}`,
        ),
      ].join(', '),
  }
}
