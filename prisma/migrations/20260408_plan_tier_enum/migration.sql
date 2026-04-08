-- Convert Tenant.planTier from TEXT to the PlanTier enum.
--
-- Background: the 20260407_stripe_billing migration added "planTier" as a
-- plain TEXT column, but prisma/schema.prisma declares it as the PlanTier
-- enum. On UPDATE Prisma casts the bound value to ::"PlanTier", which fails
-- with `type "public.PlanTier" does not exist` because the enum type was
-- never created. This migration creates the enum and converts the column
-- in place. All existing values are already one of {FREE,PRO,CLINIC}.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanTier') THEN
    CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'CLINIC');
  END IF;
END $$;

ALTER TABLE "Tenant"
  ALTER COLUMN "planTier" DROP DEFAULT,
  ALTER COLUMN "planTier" TYPE "PlanTier" USING ("planTier"::"PlanTier"),
  ALTER COLUMN "planTier" SET DEFAULT 'FREE'::"PlanTier";
