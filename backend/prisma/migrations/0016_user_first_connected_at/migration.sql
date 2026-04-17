-- AddColumn: users.first_connected_at (fallback detection of first VPN connection)
ALTER TABLE "users" ADD COLUMN "first_connected_at" TIMESTAMP(3);
