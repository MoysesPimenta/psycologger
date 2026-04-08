#!/usr/bin/env bash
# Restore a Psycologger encrypted backup into a target Postgres database.
#
# Usage:
#   scripts/restore-backup.sh <encrypted-dump> <target-db-url>
#
# Example (drill into a fresh staging Supabase project):
#   scripts/restore-backup.sh psycologger-20260407T120500Z.dump.gpg \
#     'postgresql://postgres:xxx@db.yyy.supabase.co:5432/postgres'
#
# Environment:
#   BACKUP_PASSPHRASE   — required, the GPG symmetric passphrase
#
# This script will:
#   1. Verify the checksum if a .sha256 sibling file is present
#   2. Decrypt the .gpg to a plaintext .dump
#   3. pg_restore into the target, with --clean --if-exists
#   4. Remove the plaintext dump on exit (success or failure)
#
# IMPORTANT: never run this against your production database unless you
# explicitly want to overwrite it. The intended target is a staging /
# disaster-recovery project.

set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <encrypted-dump> <target-db-url>" >&2
  exit 2
fi

ENCRYPTED="$1"
TARGET_URL="$2"

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "::error:: BACKUP_PASSPHRASE env var is required" >&2
  exit 2
fi

if [ ! -f "$ENCRYPTED" ]; then
  echo "::error:: file not found: $ENCRYPTED" >&2
  exit 2
fi

# Verify checksum if sidecar present
if [ -f "$ENCRYPTED.sha256" ]; then
  echo "==> Verifying sha256 checksum"
  sha256sum -c "$ENCRYPTED.sha256"
fi

PLAIN="${ENCRYPTED%.gpg}"
trap 'rm -f "$PLAIN"' EXIT

echo "==> Decrypting $ENCRYPTED"
gpg --batch --yes --pinentry-mode loopback \
  --passphrase "$BACKUP_PASSPHRASE" \
  --decrypt --output "$PLAIN" \
  "$ENCRYPTED"

echo "==> Restoring into target database"
# --single-transaction makes the restore atomic; if anything fails, nothing is
# half-applied. --no-owner / --no-acl skip permission statements that would
# fail against a different Supabase project's role setup.
pg_restore \
  --dbname="$TARGET_URL" \
  --clean --if-exists \
  --no-owner --no-acl \
  --single-transaction \
  --verbose \
  "$PLAIN"

echo "==> Restore complete"
