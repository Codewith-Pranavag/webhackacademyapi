-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "provider" TEXT,
ADD COLUMN     "provider_order_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_provider_order_id_key" ON "orders"("provider_order_id");

