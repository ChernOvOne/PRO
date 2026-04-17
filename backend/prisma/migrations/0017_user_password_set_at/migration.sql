-- AddColumn: users.password_set_at (tracks when admin/user set the web password)
ALTER TABLE "users" ADD COLUMN "password_set_at" TIMESTAMP(3);
