-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trade_tradeId_key" ON "Trade"("tradeId");

-- CreateIndex
CREATE INDEX "Trade_timestamp_idx" ON "Trade"("timestamp");

-- CreateIndex
CREATE INDEX "Trade_symbol_idx" ON "Trade"("symbol");

-- CreateIndex
CREATE INDEX "Trade_client_idx" ON "Trade"("client");
