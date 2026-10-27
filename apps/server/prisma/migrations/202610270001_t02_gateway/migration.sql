-- CreateEnum
CREATE TYPE "GenerationTaskStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'canceled');

-- CreateTable
CREATE TABLE "generation_tasks" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "tenant_id" UUID,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" "GenerationTaskStatus" NOT NULL DEFAULT 'queued',
    "provider_task_id" TEXT,
    "submission_started_at" TIMESTAMPTZ(3),
    "submission_token" UUID,
    "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "result_url" TEXT,
    "error_code" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "generation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "tenant_id" UUID,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generation_tasks_team_id_tenant_id_status_created_at_idx" ON "generation_tasks"("team_id", "tenant_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "generation_tasks_team_id_idempotency_key_key" ON "generation_tasks"("team_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "audit_logs_team_id_tenant_id_object_id_created_at_idx" ON "audit_logs"("team_id", "tenant_id", "object_id", "created_at");

-- Audit corrections must be new records, even outside the application client.
CREATE FUNCTION reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_progress_range" CHECK ("progress" BETWEEN 0 AND 100);
