-- IAM administration (spec §8). Data-preserving: users, roles, role
-- assignments, permissions and audit rows survive. Order for each changed
-- table: add new columns nullable -> backfill -> set NOT NULL -> drop old.
-- Old admin permission grants are remapped by the seed (LEGACY_PERMISSION_MAP).

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('SYSTEM', 'CUSTOM');

-- CreateEnum
CREATE TYPE "UserTokenType" AS ENUM ('INVITATION', 'PASSWORD_RESET', 'EMAIL_VERIFICATION');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- ─── audit_logs: new columns (existing rows become SUCCESS) ───────────────────
-- DropForeignKey (re-created below as ON DELETE RESTRICT)
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";

ALTER TABLE "audit_logs" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
ADD COLUMN     "target_label" TEXT,
ADD COLUMN     "user_agent" TEXT;

-- ─── permissions: resource / action / label (the seed overwrites them) ────────
ALTER TABLE "permissions" ADD COLUMN     "action" TEXT,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "resource" TEXT,
ADD COLUMN     "sensitive" BOOLEAN NOT NULL DEFAULT false;

UPDATE "permissions"
SET "resource" = split_part("code", '.', 2),
    "action"   = split_part("code", '.', 3),
    "label"    = "description";

ALTER TABLE "permissions" ALTER COLUMN "action" SET NOT NULL,
ALTER COLUMN "label" SET NOT NULL,
ALTER COLUMN "resource" SET NOT NULL;

-- ─── refresh_tokens: every token now belongs to a session ─────────────────────
-- Existing tokens have no session: drop them (users simply log in again).
DELETE FROM "refresh_tokens";

ALTER TABLE "refresh_tokens" ADD COLUMN     "session_id" UUID NOT NULL;

-- ─── roles: is_system -> type + is_protected ──────────────────────────────────
ALTER TABLE "roles" ADD COLUMN     "category" TEXT,
ADD COLUMN     "color" TEXT NOT NULL DEFAULT 'slate',
ADD COLUMN     "is_protected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "type" "RoleType",
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- is_system was only ever set on the protected Admin role.
UPDATE "roles"
SET "type" = CASE WHEN "is_system" THEN 'SYSTEM'::"RoleType" ELSE 'CUSTOM'::"RoleType" END,
    "is_protected" = "is_system";

ALTER TABLE "roles" ALTER COLUMN "type" SET NOT NULL,
ALTER COLUMN "type" SET DEFAULT 'CUSTOM';

ALTER TABLE "roles" DROP COLUMN "is_system";

-- ─── user_roles: who assigned, temporary assignments ──────────────────────────
ALTER TABLE "user_roles" ADD COLUMN     "assigned_by_id" UUID,
ADD COLUMN     "expires_at" TIMESTAMP(3);

-- ─── users: profile, status, security state ───────────────────────────────────
ALTER TABLE "users" ADD COLUMN     "access_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "access_reviewed_by_id" UUID,
ADD COLUMN     "deactivated_at" TIMESTAMP(3),
ADD COLUMN     "deactivated_by_id" UUID,
ADD COLUMN     "deactivation_reason" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "employee_id" TEXT,
ADD COLUMN     "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "job_title" TEXT,
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "locked_until" TIMESTAMP(3),
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "mfa_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_changed_at" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "status" "UserStatus",
ADD COLUMN     "username" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- Existing users: split full_name on the first space, ACTIVE/INACTIVE from
-- is_active, treated as verified, password set at account creation.
UPDATE "users"
SET "first_name" = split_part("full_name", ' ', 1),
    "last_name" = coalesce(nullif(substr("full_name", length(split_part("full_name", ' ', 1)) + 2), ''), ''),
    "status" = CASE WHEN "is_active" THEN 'ACTIVE'::"UserStatus" ELSE 'INACTIVE'::"UserStatus" END,
    "email_verified_at" = "created_at",
    "password_changed_at" = "created_at";

ALTER TABLE "users" ALTER COLUMN "first_name" SET NOT NULL,
ALTER COLUMN "last_name" SET NOT NULL,
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "users" DROP COLUMN "is_active";

-- Usernames are stored lower-case.
ALTER TABLE "users" ADD CONSTRAINT "users_username_lowercase" CHECK ("username" = lower("username"));

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "UserTokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_mfa" (
    "user_id" UUID NOT NULL,
    "secret_enc" TEXT NOT NULL,
    "enabled_at" TIMESTAMP(3),
    "last_used_step" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_mfa_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_policies" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "password_min_length" INTEGER NOT NULL DEFAULT 12,
    "password_max_length" INTEGER NOT NULL DEFAULT 128,
    "block_breached_passwords" BOOLEAN NOT NULL DEFAULT true,
    "breach_api_check" BOOLEAN NOT NULL DEFAULT false,
    "lockout_threshold" INTEGER NOT NULL DEFAULT 5,
    "lockout_minutes" INTEGER NOT NULL DEFAULT 15,
    "invitation_ttl_hours" INTEGER NOT NULL DEFAULT 72,
    "reset_ttl_minutes" INTEGER NOT NULL DEFAULT 60,
    "require_mfa_for_privileged" BOOLEAN NOT NULL DEFAULT true,
    "access_review_days" INTEGER NOT NULL DEFAULT 90,
    "dormant_days" INTEGER NOT NULL DEFAULT 60,
    "revoke_sessions_on_password_reset" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "body" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_tokens_token_hash_key" ON "user_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "user_tokens_user_id_type_idx" ON "user_tokens"("user_id", "type");

-- CreateIndex
CREATE INDEX "mfa_recovery_codes_user_id_idx" ON "mfa_recovery_codes"("user_id");

-- CreateIndex
CREATE INDEX "email_outbox_status_idx" ON "email_outbox"("status");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_result_idx" ON "audit_logs"("result");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_department_idx" ON "users"("department");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_deactivated_by_id_fkey" FOREIGN KEY ("deactivated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_access_reviewed_by_id_fkey" FOREIGN KEY ("access_reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mfa" ADD CONSTRAINT "user_mfa_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── audit_logs is append-only, enforced by the database ──────────────────────
-- INSERT is allowed; UPDATE and DELETE (and TRUNCATE) are rejected.
CREATE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();
