-- Add INTERNAL direction for private SA notes on support tickets.
-- Notes never leave Psycologger; they are visible only in the SA inbox.
ALTER TYPE "SupportMessageDirection" ADD VALUE IF NOT EXISTS 'INTERNAL';
