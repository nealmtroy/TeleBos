#!/usr/bin/env python3
"""Automated PostgreSQL Database Backup to Cloudflare R2.

Dumps the PostgreSQL database from the running docker container, compresses
it with gzip, uploads it to Cloudflare R2 (S3-compatible API), and enforces
retention policies both locally and remotely.

Requirements:
- Docker running container `telebos-postgres-1`
- python3-boto3 installed
- Cloudflare R2 credentials configured in .env:
    R2_ACCOUNT_ID
    R2_ACCESS_KEY_ID
    R2_SECRET_ACCESS_KEY
    R2_BUCKET_NAME
    R2_RETENTION_DAYS (optional, default: 7)

Usage:
    python3 scripts/backup_database_r2.py [--env /path/to/.env]
"""

import argparse
import datetime
import gzip
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("telebos_backup")


def load_env_file(env_path: Path) -> dict[str, str]:
    """Parse a simple .env file into a dictionary."""
    env_vars = {}
    if not env_path.is_file():
        return env_vars
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip("\"'")
                env_vars[key] = val
    return env_vars


def get_postgres_container_name() -> str:
    """Find the running postgres container name."""
    try:
        output = subprocess.check_output(
            ["docker", "ps", "--filter", "name=postgres", "--format", "{{.Names}}"],
            text=True,
        ).strip()
        names = output.splitlines()
        for name in names:
            if "postgres" in name:
                return name
    except Exception as e:
        logger.warning("Could not auto-detect postgres container name: %s", e)
    return "telebos-postgres-1"


def run_backup(env_path: Path | None = None) -> bool:
    """Execute pg_dump, gzip, upload to R2, and clean up expired backups."""
    project_root = Path(__file__).resolve().parent.parent
    if env_path is None:
        env_path = project_root / ".env"

    env_vars = load_env_file(env_path)
    # Merge with os.environ (system environment takes precedence)
    for k, v in env_vars.items():
        if k not in os.environ:
            os.environ[k] = v

    db_user = os.environ.get("POSTGRES_USER", "postgres")
    db_name = os.environ.get("POSTGRES_DB", "telebos")

    r2_account_id = os.environ.get("R2_ACCOUNT_ID")
    r2_access_key = os.environ.get("R2_ACCESS_KEY_ID")
    r2_secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    r2_bucket = os.environ.get("R2_BUCKET_NAME")
    retention_days = int(os.environ.get("R2_RETENTION_DAYS", "7"))

    if not all([r2_account_id, r2_access_key, r2_secret_key, r2_bucket]):
        logger.error(
            "Missing Cloudflare R2 credentials. Please set R2_ACCOUNT_ID, "
            "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in %s",
            env_path,
        )
        return False

    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        logger.error(
            "boto3 package not found. Please install via: sudo apt-get install -y python3-boto3"
        )
        return False

    container_name = get_postgres_container_name()
    now = datetime.datetime.now(datetime.timezone.utc)
    timestamp_str = now.strftime("%Y%m%d_%H%M%S")
    backup_filename = f"telebos_db_{timestamp_str}.sql.gz"

    backup_dir = project_root / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    local_file_path = backup_dir / backup_filename

    logger.info("Starting database backup for database '%s' from container '%s'...", db_name, container_name)

    # 1. Run pg_dump and compress with gzip
    cmd = ["docker", "exec", container_name, "pg_dump", "-U", db_user, db_name]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        with gzip.open(local_file_path, "wb") as gz_out:
            shutil.copyfileobj(proc.stdout, gz_out)
        proc.wait()

        if proc.returncode != 0:
            stderr_msg = proc.stderr.read().decode("utf-8", errors="replace")
            logger.error("pg_dump failed with exit code %d: %s", proc.returncode, stderr_msg)
            if local_file_path.exists():
                local_file_path.unlink()
            return False

        file_size_bytes = local_file_path.stat().st_size
        file_size_mb = file_size_bytes / (1024 * 1024)
        logger.info(
            "Database dump completed successfully: %s (%.2f MB)",
            backup_filename,
            file_size_mb,
        )
    except Exception as exc:
        logger.error("Exception during pg_dump: %s", exc)
        if local_file_path.exists():
            local_file_path.unlink()
        return False

    # 2. Upload to Cloudflare R2
    endpoint_url = f"https://{r2_account_id}.r2.cloudflarestorage.com"
    r2_key = f"backups/{backup_filename}"

    logger.info("Uploading to Cloudflare R2 bucket '%s' at key '%s'...", r2_bucket, r2_key)
    try:
        s3_client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=r2_access_key,
            aws_secret_access_key=r2_secret_key,
            region_name="auto",
            config=Config(retries={"max_attempts": 5, "mode": "standard"}),
        )

        s3_client.upload_file(
            Filename=str(local_file_path),
            Bucket=r2_bucket,
            Key=r2_key,
            ExtraArgs={"ContentType": "application/gzip"},
        )
        logger.info("Successfully uploaded backup to R2: %s", r2_key)
    except Exception as exc:
        logger.error("Failed to upload backup to Cloudflare R2: %s", exc)
        return False

    # 3. Clean up expired backups in Cloudflare R2 (Retention policy)
    logger.info("Checking Cloudflare R2 retention policy (%d days)...", retention_days)
    try:
        cutoff_date = now - datetime.timedelta(days=retention_days)
        paginator = s3_client.get_paginator("list_objects_v2")
        deleted_count = 0

        for page in paginator.paginate(Bucket=r2_bucket, Prefix="backups/"):
            objects = page.get("Contents", [])
            for obj in objects:
                last_modified = obj["LastModified"]
                if last_modified < cutoff_date:
                    key_to_delete = obj["Key"]
                    logger.info("Deleting expired R2 backup: %s (created %s)", key_to_delete, last_modified)
                    s3_client.delete_object(Bucket=r2_bucket, Key=key_to_delete)
                    deleted_count += 1

        if deleted_count > 0:
            logger.info("Cleaned up %d expired backups from R2", deleted_count)
        else:
            logger.info("No expired backups to clean up in R2")
    except Exception as exc:
        logger.warning("Retention cleanup warning (non-fatal): %s", exc)

    # 4. Clean up local backups (keep last 3 hourly backups locally for quick rollback)
    try:
        local_backups = sorted(
            backup_dir.glob("telebos_db_*.sql.gz"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        # Keep 3 most recent, delete older ones
        for old_file in local_backups[3:]:
            logger.info("Cleaning up old local backup: %s", old_file.name)
            old_file.unlink(missing_ok=True)
    except Exception as exc:
        logger.warning("Local retention cleanup warning: %s", exc)

    logger.info("Backup and retention cycle completed successfully!")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TeleBos Automated DB Backup to Cloudflare R2")
    parser.add_argument("--env", type=Path, default=None, help="Path to .env file")
    args = parser.parse_args()

    success = run_backup(args.env)
    sys.exit(0 if success else 1)
