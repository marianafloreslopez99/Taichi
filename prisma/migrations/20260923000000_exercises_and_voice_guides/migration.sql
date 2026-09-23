ALTER TABLE `Routine` ADD COLUMN `published` BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE `Exercise` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NOT NULL,
  `difficulty` ENUM('Principiante', 'Intermedio') NOT NULL,
  `estimatedMinutes` INTEGER NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RoutineExercise` (
  `routineId` VARCHAR(191) NOT NULL,
  `exerciseId` VARCHAR(191) NOT NULL,
  `order` INTEGER NOT NULL,
  UNIQUE INDEX `RoutineExercise_routineId_order_key`(`routineId`, `order`),
  INDEX `RoutineExercise_exerciseId_idx`(`exerciseId`),
  PRIMARY KEY (`routineId`, `exerciseId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Exercise` (
  `id`, `name`, `description`, `difficulty`, `estimatedMinutes`, `category`, `updatedAt`
)
SELECT `id`, `name`, `description`, `difficulty`, `estimatedMinutes`, `category`, CURRENT_TIMESTAMP(3)
FROM `Routine`;

INSERT INTO `RoutineExercise` (`routineId`, `exerciseId`, `order`)
SELECT `id`, `id`, 1 FROM `Routine`;

ALTER TABLE `Movement` DROP FOREIGN KEY `Movement_routineId_fkey`;
DROP INDEX `Movement_routineId_order_key` ON `Movement`;
DROP INDEX `Movement_routineId_idx` ON `Movement`;

ALTER TABLE `Movement` RENAME COLUMN `routineId` TO `exerciseId`;
ALTER TABLE `Movement` RENAME COLUMN `visual` TO `image`;
ALTER TABLE `Movement` ADD COLUMN `voiceGuide` JSON NULL;
UPDATE `Movement`
SET `voiceGuide` = JSON_ARRAY(
  JSON_OBJECT('text', `instruction`, 'pauseAfterMs', 0)
);
ALTER TABLE `Movement` MODIFY `voiceGuide` JSON NOT NULL;

CREATE UNIQUE INDEX `Movement_exerciseId_order_key` ON `Movement`(`exerciseId`, `order`);
CREATE INDEX `Movement_exerciseId_idx` ON `Movement`(`exerciseId`);

ALTER TABLE `RoutineExercise` ADD CONSTRAINT `RoutineExercise_routineId_fkey`
FOREIGN KEY (`routineId`) REFERENCES `Routine`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RoutineExercise` ADD CONSTRAINT `RoutineExercise_exerciseId_fkey`
FOREIGN KEY (`exerciseId`) REFERENCES `Exercise`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Movement` ADD CONSTRAINT `Movement_exerciseId_fkey`
FOREIGN KEY (`exerciseId`) REFERENCES `Exercise`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
