-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "tenant_id" UUID,
    "union_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "avatar_url" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "assigned" BOOLEAN NOT NULL DEFAULT false,
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_union_id_key" ON "users"("union_id");

-- CreateIndex
CREATE INDEX "users_team_id_tenant_id_status_idx" ON "users"("team_id", "tenant_id", "status");
