-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "smsError" TEXT,
ADD COLUMN     "smsMessageSid" TEXT,
ADD COLUMN     "smsSentAt" TIMESTAMP(3),
ADD COLUMN     "smsStatus" "NotificationDeliveryStatus",
ADD COLUMN     "whatsappError" TEXT,
ADD COLUMN     "whatsappMessageSid" TEXT,
ADD COLUMN     "whatsappSentAt" TIMESTAMP(3),
ADD COLUMN     "whatsappStatus" "NotificationDeliveryStatus";

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "variantNameSnapshot" TEXT;

