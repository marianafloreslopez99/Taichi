CREATE TYPE "Difficulty" AS ENUM ('Principiante', 'Intermedio');
CREATE TYPE "SessionStatus" AS ENUM ('PLAYING', 'PAUSED', 'ASKING', 'COMPLETED');

CREATE TABLE "Routine" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "difficulty" "Difficulty" NOT NULL,
  "estimatedMinutes" INTEGER NOT NULL,
  "category" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Movement" (
  "id" TEXT NOT NULL,
  "routineId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "instruction" TEXT NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "tips" JSONB NOT NULL,
  "visual" TEXT NOT NULL,
  CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "routineId" TEXT NOT NULL,
  "currentMovementIndex" INTEGER NOT NULL DEFAULT 0,
  "status" "SessionStatus" NOT NULL DEFAULT 'PLAYING',
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "elapsedSeconds" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AIQuestion" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "movementId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AIQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Movement_routineId_order_key" ON "Movement"("routineId", "order");
CREATE INDEX "Movement_routineId_idx" ON "Movement"("routineId");
CREATE INDEX "Session_routineId_idx" ON "Session"("routineId");
CREATE INDEX "Session_status_idx" ON "Session"("status");
CREATE INDEX "AIQuestion_sessionId_idx" ON "AIQuestion"("sessionId");

ALTER TABLE "Movement" ADD CONSTRAINT "Movement_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIQuestion" ADD CONSTRAINT "AIQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIQuestion" ADD CONSTRAINT "AIQuestion_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "Movement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
