-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "customMadeDetails" TEXT,
ADD COLUMN     "customMadeImageUrl" TEXT,
ADD COLUMN     "isCustomMade" BOOLEAN NOT NULL DEFAULT false;

