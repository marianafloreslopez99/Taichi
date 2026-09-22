export type Difficulty = 'Principiante' | 'Intermedio'
export type SessionStatus = 'PLAYING' | 'PAUSED' | 'ASKING' | 'COMPLETED'

export interface Movement {
  id: string
  order: number
  name: string
  description: string
  instruction: string
  durationSeconds: number
  tips: string[]
  visual: 'opening' | 'cloud' | 'tree' | 'wave' | 'breath' | 'closing'
}

export interface Routine {
  id: string
  name: string
  description: string
  difficulty: Difficulty
  estimatedMinutes: number
  category: string
  movements: Movement[]
}

export interface AIQuestion {
  id: string
  sessionId: string
  movementId: string
  question: string
  answer: string
  createdAt: number
}

export interface PracticeSession {
  id: string
  routineId: string
  currentMovementIndex: number
  status: SessionStatus
  startedAt: number
  completedAt: number | null
  elapsedSeconds: number
  questions: AIQuestion[]
}
