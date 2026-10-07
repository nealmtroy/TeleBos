#!/usr/bin/env python3
"""Automated PostgreSQL Database Restore from Cloudflare R2.

Downloads the latest (or specified) PostgreSQL backup from Cloudflare R2,
decompresses it, and restores it into the running postgres container.

Requirements:
- Docker running container `telebos-postgres-1` (or auto-detected postgres container)
- python3-boto3 installed
- Cloudflare R2 credentials configured in .env:
    R2_ACCOUNT_ID
    R2_ACCESS_KEY_ID
    R2_SECRET_ACCESS_KEY
    R2_BUCKET_NAME

Usage:
    python3 scripts/restore_database_r2.py [--latest] [--list] [--key <r2_key>] [--file <local_file>]
"""

import argparse
import gzip
import logging
import os
import subprocess
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("telebos_restore")


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


def get_s3_client(env_vars: dict[str, str]):
    import boto3
    from botocore.config import Config

    endpoint_url = f"https://{env_vars['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=env_vars["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env_vars["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=Config(retries={"max_attempts": 5, "mode": "standard"}),
    )


def list_r2_backups(s3_client, bucket: str) -> list[dict]:
    paginator = s3_client.get_paginator("list_objects_v2")
    backups = []
    for page in paginator.paginate(Bucket=bucket, Prefix="backups/"):
        for item in page.get("Contents", []):
            if item["Key"].endswith(".sql.gz"):
                backups.append(item)
    backups.sort(key=lambda x: x["LastModified"], reverse=True)
    return backups


def restore_backup(
    env_path: Path | None = None,
    backup_key: str | None = None,
    local_file: Path | None = None,
    list_only: bool = False,
) -> bool:
    project_root = Path(__file__).resolve().parent.parent
    if env_path is None:
        env_path = project_root / ".env"

    env_vars = load_env_file(env_path)
    for k, v in env_vars.items():
        if k not in os.environ:
            os.environ[k] = v

    db_user = os.environ.get("POSTGRES_USER", "postgres")
    db_name = os.environ.get("POSTGRES_DB", "telebos")
    db_password = os.environ.get("POSTGRES_PASSWORD", "postgres")

    r2_bucket = os.environ.get("R2_BUCKET_NAME")

    if not local_file:
        try:
            import boto3
        except ImportError:
            logger.error("boto3 package not found. Please install via: pip install boto3 or apt-get install python3-boto3")
            return False

        if not all([os.environ.get("R2_ACCOUNT_ID"), os.environ.get("R2_ACCESS_KEY_ID"), os.environ.get("R2_SECRET_ACCESS_KEY"), r2_bucket]):
            logger.error("Missing Cloudflare R2 credentials in %s", env_path)
            return False

        s3_client = get_s3_client(os.environ)

        backups = list_r2_backups(s3_client, r2_bucket)
        if not backups:
            logger.error("No backups found in R2 bucket '%s'", r2_bucket)
            return False

        if list_only:
            logger.info("Found %d backups in Cloudflare R2 bucket '%s':", len(backups), r2_bucket)
            for i, b in enumerate(backups[:10], 1):
                size_mb = b["Size"] / (1024 * 1024)
                logger.info(" %2d. %s (%.2f MB) - %s", i, b["Key"], size_mb, b["LastModified"])
            return True

        if not backup_key:
            latest = backups[0]
            backup_key = latest["Key"]
            logger.info("Selecting latest backup: %s (%.2f MB, %s)", backup_key, latest["Size"] / (1024 * 1024), latest["LastModified"])

        backup_dir = project_root / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        local_filename = Path(backup_key).name
        target_path = backup_dir / local_filename

        logger.info("Downloading '%s' from R2 to '%s'...", backup_key, target_path)
        s3_client.download_file(r2_bucket, backup_key, str(target_path))
        local_file = target_path
    else:
        if not local_file.exists():
            logger.error("Local backup file not found: %s", local_file)
            return False

    logger.info("Backup file ready: %s (%.2f MB)", local_file, local_file.stat().st_size / (1024 * 1024))

    container_name = get_postgres_container_name()
    logger.info("Target Postgres container: '%s'", container_name)

    # Verify container is reachable
    check_cmd = ["docker", "exec", container_name, "pg_isready", "-U", db_user]
    res = subprocess.run(check_cmd, capture_output=True, text=True)
    if res.returncode != 0:
        logger.error("Postgres container '%s' is not ready: %s", container_name, res.stderr)
        return False

    logger.info("Restoring database '%s' from '%s'...", db_name, local_file.name)

    # We pipe gunzip output directly into docker exec -i <container> psql
    psql_cmd = [
        "docker",
        "exec",
        "-i",
        "-e",
        f"PGPASSWORD={db_password}",
        container_name,
        "psql",
        "-U",
        db_user,
        "-d",
        db_name,
        "-v",
        "ON_ERROR_STOP=0",
    ]

    try:
        proc = subprocess.Popen(
            psql_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        with gzip.open(local_file, "rb") as gz_in:
            while True:
                chunk = gz_in.read(1024 * 1024)
                if not chunk:
                    break
                proc.stdin.write(chunk)
        stdout, stderr = proc.communicate()

        if proc.returncode != 0:
            logger.warning("psql returned non-zero code (%d): %s", proc.returncode, stderr.decode("utf-8", errors="replace")[:500])
        else:
            logger.info("psql restore stream finished cleanly.")

        # Verify restoration by counting tables and rows
        verify_cmd = [
            "docker",
            "exec",
            "-i",
            "-e",
            f"PGPASSWORD={db_password}",
            container_name,
            "psql",
            "-U",
            db_user,
            "-d",
            db_name,
            "-t",
            "-c",
            "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';",
        ]
        verify_res = subprocess.run(verify_cmd, capture_output=True, text=True)
        table_count = verify_res.stdout.strip()
        logger.info("Restore verification: Found %s public tables in database '%s'.", table_count, db_name)

        user_count_cmd = [
            "docker",
            "exec",
            "-i",
            "-e",
            f"PGPASSWORD={db_password}",
            container_name,
            "psql",
            "-U",
            db_user,
            "-d",
            db_name,
            "-t",
            "-c",
            "SELECT count(*) FROM \"user\";",
        ]
        user_res = subprocess.run(user_count_cmd, capture_output=True, text=True)
        if user_res.returncode == 0:
            logger.info("User table count: %s users restored.", user_res.stdout.strip())

        logger.info("Database restoration completed successfully!")
        return True
    except Exception as exc:
        logger.error("Failed to restore database: %s", exc)
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TeleBos Automated DB Restore from Cloudflare R2")
    parser.add_argument("--env", type=Path, default=None, help="Path to .env file")
    parser.add_argument("--key", type=str, default=None, help="Cloudflare R2 object key to restore")
    parser.add_argument("--file", type=Path, default=None, help="Local .sql.gz backup file to restore directly")
    parser.add_argument("--list", action="store_true", help="List available backups in R2")
    parser.add_argument("--latest", action="store_true", help="Restore the latest backup from R2 (default)")
    args = parser.parse_args()

    success = restore_backup(
        env_path=args.env,
        backup_key=args.key,
        local_file=args.file,
        list_only=args.list,
    )
    sys.exit(0 if success else 1)
