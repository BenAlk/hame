-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "binReminders" BOOLEAN NOT NULL DEFAULT true,
    "choreReminders" BOOLEAN NOT NULL DEFAULT true,
    "expiryWarnings" BOOLEAN NOT NULL DEFAULT true,
    "lowStockAlerts" BOOLEAN NOT NULL DEFAULT true,
    "petCareReminders" BOOLEAN NOT NULL DEFAULT true,
    "customEventReminders" BOOLEAN NOT NULL DEFAULT true,
    "pushViaHA" BOOLEAN NOT NULL DEFAULT true,
    "haNotifyService" TEXT,
    "criticalAlerts" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
