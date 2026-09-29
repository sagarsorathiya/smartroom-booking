-- CreateTable
CREATE TABLE "booking_attachments" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_attachments_bookingId_idx" ON "booking_attachments"("bookingId");

-- AddForeignKey
ALTER TABLE "booking_attachments" ADD CONSTRAINT "booking_attachments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
