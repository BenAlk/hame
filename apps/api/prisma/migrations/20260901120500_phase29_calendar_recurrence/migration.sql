-- AlterTable
ALTER TABLE "CalendarObject" ADD COLUMN     "recurrenceType" "RecurrenceType",
ADD COLUMN     "intervalDays" INTEGER,
ADD COLUMN     "weekdays" "Weekday"[] DEFAULT ARRAY[]::"Weekday"[],
ADD COLUMN     "dayOfMonth" INTEGER,
ADD COLUMN     "recurrenceAnchor" DATE;
