-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "preferMorning" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SchoolSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "maxSameSubjectPerDay" INTEGER NOT NULL DEFAULT 2,
    "teacherMaxConsecutivePeriods" INTEGER NOT NULL DEFAULT 0,
    "spreadSubjectsAcrossWeek" BOOLEAN NOT NULL DEFAULT true,
    "preferMorningForPriority" BOOLEAN NOT NULL DEFAULT true,
    "avoidTeacherGaps" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolSettings_schoolId_key" ON "SchoolSettings"("schoolId");

-- AddForeignKey
ALTER TABLE "SchoolSettings" ADD CONSTRAINT "SchoolSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
