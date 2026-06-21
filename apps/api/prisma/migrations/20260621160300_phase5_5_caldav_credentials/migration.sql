-- CreateTable
CREATE TABLE "CalDavCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalDavCredential_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CalDavCredential" ADD CONSTRAINT "CalDavCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
