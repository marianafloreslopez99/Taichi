import { PrismaClient } from '@prisma/client'
import { routines } from '../src/infrastructure/routines.js'

process.loadEnvFile?.('.env')

const prisma = new PrismaClient()

async function main() {
  for (const routine of routines) {
    await prisma.routine.upsert({
      where: { id: routine.id },
      update: {
        name: routine.name,
        description: routine.description,
        difficulty: routine.difficulty,
        estimatedMinutes: routine.estimatedMinutes,
        category: routine.category,
      },
      create: {
        id: routine.id,
        name: routine.name,
        description: routine.description,
        difficulty: routine.difficulty,
        estimatedMinutes: routine.estimatedMinutes,
        category: routine.category,
        movements: {
          create: routine.movements.map((movement) => ({
            id: movement.id,
            order: movement.order,
            name: movement.name,
            description: movement.description,
            instruction: movement.instruction,
            durationSeconds: movement.durationSeconds,
            tips: movement.tips,
            visual: movement.visual,
          })),
        },
      },
    })
    for (const movement of routine.movements) {
      await prisma.movement.upsert({
        where: { id: movement.id },
        update: {
          routineId: routine.id,
          order: movement.order,
          name: movement.name,
          description: movement.description,
          instruction: movement.instruction,
          durationSeconds: movement.durationSeconds,
          tips: movement.tips,
          visual: movement.visual,
        },
        create: {
          id: movement.id,
          routineId: routine.id,
          order: movement.order,
          name: movement.name,
          description: movement.description,
          instruction: movement.instruction,
          durationSeconds: movement.durationSeconds,
          tips: movement.tips,
          visual: movement.visual,
        },
      })
    }
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
