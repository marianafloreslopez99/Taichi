import { Prisma, PrismaClient } from '@prisma/client'
import { routines } from '../src/content/routineContent.js'

process.loadEnvFile?.('.env')

const prisma = new PrismaClient()

async function main() {
  await prisma.$transaction(async (transaction) => {
    await transaction.routine.updateMany({
      where: { id: { in: ['fundamentos', 'relajacion', 'manana'] } },
      data: { published: false },
    })

    for (const routine of routines) {
      await transaction.routine.upsert({
        where: { id: routine.id },
        update: {
          name: routine.name,
          description: routine.description,
          difficulty: routine.difficulty,
          estimatedMinutes: routine.estimatedMinutes,
          category: routine.category,
          published: true,
        },
        create: {
          id: routine.id,
          name: routine.name,
          description: routine.description,
          difficulty: routine.difficulty,
          estimatedMinutes: routine.estimatedMinutes,
          category: routine.category,
          published: true,
        },
      })

      await transaction.routineExercise.deleteMany({
        where: { routineId: routine.id },
      })

      for (const exercise of routine.exercises) {
        await transaction.exercise.upsert({
          where: { id: exercise.id },
          update: {
            name: exercise.name,
            description: exercise.description,
            difficulty: exercise.difficulty,
            estimatedMinutes: exercise.estimatedMinutes,
            category: exercise.category,
          },
          create: {
            id: exercise.id,
            name: exercise.name,
            description: exercise.description,
            difficulty: exercise.difficulty,
            estimatedMinutes: exercise.estimatedMinutes,
            category: exercise.category,
          },
        })
        await transaction.routineExercise.create({
          data: {
            routineId: routine.id,
            exerciseId: exercise.id,
            order: exercise.order,
          },
        })

        const movementIds = exercise.movements.map((movement) => movement.id)
        await transaction.movement.deleteMany({
          where: {
            exerciseId: exercise.id,
            id: { notIn: movementIds },
          },
        })

        for (const movement of exercise.movements) {
          const voiceGuide = movement.voiceGuide.map(
            (cue): Prisma.InputJsonObject => ({
              text: cue.text,
              pauseAfterMs: cue.pauseAfterMs,
            }),
          )
          await transaction.movement.upsert({
            where: { id: movement.id },
            update: {
              exerciseId: exercise.id,
              order: movement.order,
              name: movement.name,
              description: movement.description,
              instruction: movement.instruction,
              durationSeconds: movement.durationSeconds,
              voiceGuide,
              tips: movement.tips,
              image: movement.image,
            },
            create: {
              id: movement.id,
              exerciseId: exercise.id,
              order: movement.order,
              name: movement.name,
              description: movement.description,
              instruction: movement.instruction,
              durationSeconds: movement.durationSeconds,
              voiceGuide,
              tips: movement.tips,
              image: movement.image,
            },
          })
        }
      }
    }
  })
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
