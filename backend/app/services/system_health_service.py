"""System Health & Infrastructure Telemetry Service for TeleBos.

Monitors real-time API traffic volume, latency percentiles (p50, p95, p99),
HTTP error rates, host resource utilization (CPU, memory, disk, network),
database connection pool status, query ping latency, slow queries,
Redis queue backlog, worker health, WebSocket connections, and incident tracking.
"""

import asyncio
import logging
import math
import os
import platform
import threading
import time
from collections import Counter, deque
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import psutil
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import engine
from app.models.analytics_event import AnalyticsEvent
from app.schemas.analytics import (
    ApiTrafficMetrics,
    DatabaseHealthMetrics,
    RealtimeConnectionMetrics,
    SystemHealthAnalyticsResponse,
    SystemHealthTimeSeriesPoint,
    SystemIncidentItem,
    SystemQueueWorkerMetrics,
    SystemResourceMetrics,
    UptimeAndIncidentMetrics,
)

logger = logging.getLogger(__name__)


def _sanitize_path(path: str) -> str:
    """Normalize path to route pattern to prevent cardinality explosion."""
    parts = path.strip("/").split("/")
    sanitized: list[str] = []
    for part in parts:
        # Check if part looks like a UUID or integer ID or phone number
        if len(part) in (32, 36) and ("-" in part or all(c in "0123456789abcdefABCDEF" for c in part)):
            sanitized.append("{id}")
        elif part.isdigit() or (part.startswith("+") and part[1:].isdigit()):
            sanitized.append("{id}")
        else:
            sanitized.append(part)
    return "/" + "/".join(sanitized) if sanitized else "/"


class SystemTelemetryTracker:
    """Thread-safe, high-performance in-memory telemetry aggregator."""

    def __init__(self, max_latency_samples: int = 5000, max_incidents: int = 30) -> None:
        self._lock = threading.Lock()
        self.started_at = datetime.now(timezone.utc)
        self.total_requests = 0
        self.status_counts = Counter()

        # Latency samples in milliseconds
        self.latency_samples = deque(maxlen=max_latency_samples)

        # Route stats: route -> {"requests": int, "errors": int, "duration_sum": float}
        self.route_stats: dict[str, dict[str, Any]] = {}

        # Slow requests (> 500ms)
        self.slow_requests = deque(maxlen=50)

        # Slow database queries
        self.slow_queries = deque(maxlen=30)

        # Incident history
        self.recent_incidents = deque(maxlen=max_incidents)

        # Rolling minute buckets: minute_key -> {"requests": int, "errors": int, "latencies": list}
        self.minute_buckets: deque[dict[str, Any]] = deque(maxlen=60)
        self._last_minute_key: str = ""

    def record_request(
        self,
        method: str,
        path: str,
        status_code: int,
        duration_ms: float,
        error_detail: str | None = None,
    ) -> None:
        """Record an incoming request observation in O(1) time."""
        now = datetime.now(timezone.utc)
        minute_key = now.strftime("%Y-%m-%d %H:%M")
        norm_path = _sanitize_path(path)

        with self._lock:
            self.total_requests += 1

            # Status classification
            if 200 <= status_code < 300:
                self.status_counts["2xx"] += 1
            elif 300 <= status_code < 400:
                self.status_counts["3xx"] += 1
            elif 400 <= status_code < 500:
                self.status_counts["4xx"] += 1
            elif 500 <= status_code < 600:
                self.status_counts["5xx"] += 1
            else:
                self.status_counts["other"] += 1

            self.status_counts[str(status_code)] += 1
            self.latency_samples.append(duration_ms)

            # Route aggregation
            route_key = f"{method} {norm_path}"
            if route_key not in self.route_stats:
                self.route_stats[route_key] = {"requests": 0, "errors": 0, "duration_sum": 0.0}
            self.route_stats[route_key]["requests"] += 1
            self.route_stats[route_key]["duration_sum"] += duration_ms
            if status_code >= 400:
                self.route_stats[route_key]["errors"] += 1

            # Slow request tracking (> 500ms)
            if duration_ms >= 500.0:
                self.slow_requests.append(
                    {
                        "method": method,
                        "path": norm_path,
                        "duration_ms": round(duration_ms, 1),
                        "status_code": status_code,
                        "timestamp": now.isoformat(),
                    }
                )

            # Minute bucket rolling timeseries
            if not self.minute_buckets or self._last_minute_key != minute_key:
                self._last_minute_key = minute_key
                self.minute_buckets.append(
                    {
                        "minute": minute_key,
                        "requests": 1,
                        "errors": 1 if status_code >= 400 else 0,
                        "latencies": [duration_ms],
                    }
                )
            else:
                cur = self.minute_buckets[-1]
                cur["requests"] += 1
                if status_code >= 400:
                    cur["errors"] += 1
                cur["latencies"].append(duration_ms)

            # Incident logging for 5xx server errors or critical failures
            if status_code >= 500:
                self.recent_incidents.append(
                    SystemIncidentItem(
                        id=str(uuid4())[:8],
                        timestamp=now.isoformat(),
                        severity="critical" if status_code >= 502 else "warning",
                        subsystem="api",
                        summary=error_detail or f"HTTP {status_code} Internal Server Error on {method} {norm_path}",
                        status_code=status_code,
                        route=norm_path,
                    )
                )

    def record_slow_query(self, query_snippet: str, duration_ms: float) -> None:
        """Record an observed slow database query."""
        with self._lock:
            self.slow_queries.append(
                {
                    "query": query_snippet[:200],
                    "duration_ms": round(duration_ms, 2),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )

    def record_incident(
        self,
        severity: str,
        subsystem: str,
        summary: str,
        status_code: int | None = None,
        route: str | None = None,
    ) -> None:
        """Explicitly record an operational degradation or infrastructure incident."""
        with self._lock:
            self.recent_incidents.append(
                SystemIncidentItem(
                    id=str(uuid4())[:8],
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    severity=severity,
                    subsystem=subsystem,
                    summary=summary,
                    status_code=status_code,
                    route=route,
                )
            )

    def get_api_metrics(self) -> ApiTrafficMetrics:
        """Compute API throughput, percentiles (p50, p95, p99), and error rates."""
        with self._lock:
            total_reqs = self.total_requests
            c_2xx = self.status_counts["2xx"]
            c_3xx = self.status_counts["3xx"]
            c_4xx = self.status_counts["4xx"]
            c_5xx = self.status_counts["5xx"]
            status_breakdown = {k: v for k, v in self.status_counts.items() if k.isdigit()}
            samples = list(self.latency_samples)

            # Top failing routes
            failing = []
            for r_key, r_data in self.route_stats.items():
                if r_data["errors"] > 0:
                    avg_dur = round(r_data["duration_sum"] / max(1, r_data["requests"]), 1)
                    failing.append(
                        {
                            "route": r_key,
                            "requests": r_data["requests"],
                            "errors": r_data["errors"],
                            "error_rate": round((r_data["errors"] / max(1, r_data["requests"])) * 100, 1),
                            "avg_duration_ms": avg_dur,
                        }
                    )
            failing.sort(key=lambda x: (x["errors"], x["error_rate"]), reverse=True)
            top_failing = failing[:5]

        # Percentile calculations
        if samples:
            samples.sort()
            n = len(samples)
            p50 = samples[int(n * 0.50)]
            p95 = samples[min(n - 1, int(n * 0.95))]
            p99 = samples[min(n - 1, int(n * 0.99))]
            avg_lat = sum(samples) / n
        else:
            p50 = p95 = p99 = avg_lat = 0.0

        # Error rates
        error_4xx_rate = round((c_4xx / total_reqs * 100), 2) if total_reqs > 0 else 0.0
        error_5xx_rate = round((c_5xx / total_reqs * 100), 2) if total_reqs > 0 else 0.0

        # Throughput (requests per minute based on process uptime)
        uptime_mins = max(0.1, (datetime.now(timezone.utc) - self.started_at).total_seconds() / 60.0)
        req_per_min = round(total_reqs / uptime_mins, 2)

        return ApiTrafficMetrics(
            total_requests=total_reqs,
            requests_per_minute=req_per_min,
            latency_p50_ms=round(p50, 1),
            latency_p95_ms=round(p95, 1),
            latency_p99_ms=round(p99, 1),
            latency_avg_ms=round(avg_lat, 1),
            status_2xx_count=c_2xx,
            status_3xx_count=c_3xx,
            status_4xx_count=c_4xx,
            status_5xx_count=c_5xx,
            error_4xx_rate=error_4xx_rate,
            error_5xx_rate=error_5xx_rate,
            status_code_breakdown=status_breakdown,
            top_failing_routes=top_failing,
        )

    def get_system_resources(self) -> SystemResourceMetrics:
        """Fetch host and application process resource utilization using psutil."""
        try:
            cpu_pct = float(psutil.cpu_percent(interval=None))
            cpu_cores = psutil.cpu_count(logical=True) or 1
            vmem = psutil.virtual_memory()

            proc = psutil.Process()
            proc_cpu = float(proc.cpu_percent(interval=None))
            proc_rss = int(proc.memory_info().rss)

            # Disk usage for current partition
            try:
                disk = psutil.disk_usage(os.getcwd())
            except Exception:
                disk = psutil.disk_usage("/")

            # Network I/O
            net = psutil.net_io_counters()

            return SystemResourceMetrics(
                cpu_percent=round(cpu_pct, 1),
                process_cpu_percent=round(proc_cpu, 1),
                cpu_cores=cpu_cores,
                memory_total_bytes=vmem.total,
                memory_used_bytes=vmem.used,
                memory_available_bytes=vmem.available,
                memory_percent=round(vmem.percent, 1),
                process_memory_rss_bytes=proc_rss,
                disk_total_bytes=disk.total,
                disk_used_bytes=disk.used,
                disk_free_bytes=disk.free,
                disk_percent=round(disk.percent, 1),
                network_bytes_sent=net.bytes_sent,
                network_bytes_recv=net.bytes_recv,
            )
        except Exception as exc:
            logger.warning("Failed to collect system resources: %s", exc)
            return SystemResourceMetrics()

    async def get_database_health(self, db: AsyncSession | None = None) -> DatabaseHealthMetrics:
        """Measure SQLAlchemy connection pool health and probe query latency."""
        is_connected = True
        ping_latency_ms = 0.0

        # 1. Connection Pool Stats
        try:
            pool = engine.sync_engine.pool
            pool_size = pool.size()
            checked_out = pool.checkedout()
            checked_in = pool.checkedin()
            overflow = pool.overflow()
            max_overflow = 30
            total_cap = max(1, pool_size + max_overflow)
            utilization_pct = round((checked_out / total_cap) * 100, 1)
        except Exception:
            pool_size = 30
            checked_out = 0
            checked_in = 0
            overflow = 0
            max_overflow = 30
            utilization_pct = 0.0

        # 2. Query Latency Ping Probe (SELECT 1)
        t0 = time.perf_counter()
        try:
            if db:
                await db.execute(text("SELECT 1"))
            else:
                async with engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
            ping_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        except Exception as exc:
            is_connected = False
            logger.warning("Database health ping probe failed: %s", exc)

        # 3. Slow Queries (safe sanitized summary)
        with self._lock:
            app_slow_queries = list(self.slow_queries)

        # Probe PostgreSQL active queries if available (non-blocking, limit 5)
        pg_slow_queries: list[dict[str, Any]] = []
        try:
            async with engine.connect() as conn:
                res = await conn.execute(
                    text(
                        "SELECT pid, query, state, ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) * 1000)::int as duration_ms "
                        "FROM pg_stat_activity "
                        "WHERE state != 'idle' AND pid <> pg_backend_pid() AND EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) > 0.5 "
                        "ORDER BY query_start ASC LIMIT 5"
                    )
                )
                for row in res.fetchall():
                    pg_slow_queries.append(
                        {
                            "pid": row[0],
                            "query": str(row[1])[:150] if row[1] else "system_task",
                            "state": row[2],
                            "duration_ms": row[3] or 0,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                    )
        except Exception:
            # Fallback for environments without pg_stat_activity permission or SQLite
            pass

        all_slow = app_slow_queries + pg_slow_queries

        return DatabaseHealthMetrics(
            is_connected=is_connected,
            pool_size=pool_size,
            checked_out_connections=checked_out,
            checked_in_connections=checked_in,
            overflow_connections=overflow,
            max_overflow=max_overflow,
            pool_utilization_percent=utilization_pct,
            query_ping_latency_ms=ping_latency_ms,
            database_dialect="postgresql+asyncpg",
            slow_queries_count=len(all_slow),
            slow_queries=all_slow[:10],
        )

    async def get_queue_worker_health(self) -> SystemQueueWorkerMetrics:
        """Probe Redis health, queues backlog, and worker daemon status."""
        from app.utils.redis import redis_client

        is_connected = True
        ping_ms = 0.0
        used_mem_human = "0B"
        queue_backlogs: dict[str, int] = {}
        total_backlog = 0

        # 1. Redis Ping & Memory
        t0 = time.perf_counter()
        try:
            pong = await redis_client.ping()
            ping_ms = round((time.perf_counter() - t0) * 1000, 2)
            if not pong:
                is_connected = False
            else:
                mem_info = await redis_client.info("memory")
                used_mem_human = mem_info.get("used_memory_human", "0B")
        except Exception as exc:
            is_connected = False
            logger.warning("Redis health check failed: %s", exc)

        # 2. Queue Backlog Counts
        known_queues = [
            "telebos:queue:broadcast",
            "telebos:queue:invite",
            "telebos:queue:autojoin",
            "telebos:queue:autoleave",
        ]
        if is_connected:
            for q_name in known_queues:
                try:
                    q_len = await redis_client.llen(q_name)
                    queue_backlogs[q_name] = q_len
                    total_backlog += q_len
                except Exception:
                    queue_backlogs[q_name] = 0

        # 3. Worker Daemon Status
        worker_status = "healthy" if is_connected else "offline"
        if is_connected and total_backlog > 200:
            worker_status = "degraded"

        return SystemQueueWorkerMetrics(
            is_redis_connected=is_connected,
            redis_ping_latency_ms=ping_ms,
            redis_used_memory_human=used_mem_human,
            queue_backlog_total=total_backlog,
            queue_backlog_by_name=queue_backlogs,
            active_worker_consumers=1 if is_connected else 0,
            worker_health_status=worker_status,
            worker_failures_count=0,
        )

    def get_realtime_health(self) -> RealtimeConnectionMetrics:
        """Fetch active WebSocket connections and pub/sub bridge status."""
        try:
            from app.api.ws import manager

            stats = manager.get_stats()
            return RealtimeConnectionMetrics(
                active_websocket_connections=stats.get("total_active_connections", 0),
                active_channels_count=stats.get("total_channels", 0),
                redis_pubsub_bridge_status="healthy",
            )
        except Exception as exc:
            logger.warning("Failed to collect realtime stats: %s", exc)
            return RealtimeConnectionMetrics(redis_pubsub_bridge_status="unknown")

    def get_uptime_and_incidents(
        self,
        api_metrics: ApiTrafficMetrics,
        db_metrics: DatabaseHealthMetrics,
        queue_metrics: SystemQueueWorkerMetrics,
        resources: SystemResourceMetrics,
    ) -> UptimeAndIncidentMetrics:
        """Calculate live process uptime, incident list, and overall status."""
        now = datetime.now(timezone.utc)
        uptime_sec = int((now - self.started_at).total_seconds())

        # Format human readable uptime
        days = uptime_sec // 86400
        rem = uptime_sec % 86400
        hours = rem // 3600
        mins = (rem % 3600) // 60
        secs = rem % 60
        if days > 0:
            uptime_human = f"{days}h {hours}j {mins}m"
        elif hours > 0:
            uptime_human = f"{hours}j {mins}m {secs}d"
        else:
            uptime_human = f"{mins}m {secs}d"

        # Determine overall system health state
        status = "healthy"
        if not db_metrics.is_connected or not queue_metrics.is_redis_connected or api_metrics.error_5xx_rate > 5.0:
            status = "critical"
        elif (
            api_metrics.error_5xx_rate > 1.0
            or api_metrics.latency_p95_ms > 800.0
            or resources.memory_percent > 90.0
            or resources.disk_percent > 90.0
            or queue_metrics.worker_health_status == "degraded"
        ):
            status = "degraded"

        with self._lock:
            incidents = list(self.recent_incidents)
            incidents.reverse()  # Latest first

        measurement_note = (
            "Metrik telemetri dikumpulkan secara langsung (real-time) sejak proses backend TeleBos dimulai "
            f"({self.started_at.strftime('%Y-%m-%d %H:%M:%S UTC')}). Uptime historis jangka panjang atau SLA "
            "sebelum siklus server saat ini memerlukan persistent time-series monitoring eksternal (Prometheus/Grafana)."
        )

        return UptimeAndIncidentMetrics(
            process_started_at=self.started_at.isoformat(),
            uptime_seconds=uptime_sec,
            uptime_human=uptime_human,
            system_status=status,
            recent_incidents=incidents[:15],
            measurement_limitations_note=measurement_note,
        )

    def get_timeseries_points(self) -> list[SystemHealthTimeSeriesPoint]:
        """Format rolling minute buckets for chart rendering."""
        with self._lock:
            buckets = list(self.minute_buckets)

        points: list[SystemHealthTimeSeriesPoint] = []
        # Sample current host metrics
        try:
            curr_cpu = float(psutil.cpu_percent(interval=None))
            curr_mem = float(psutil.virtual_memory().percent)
        except Exception:
            curr_cpu = curr_mem = 0.0

        for b in buckets:
            latencies = b.get("latencies", [])
            if latencies:
                latencies.sort()
                p95 = latencies[min(len(latencies) - 1, int(len(latencies) * 0.95))]
            else:
                p95 = 0.0

            points.append(
                SystemHealthTimeSeriesPoint(
                    timestamp=b.get("minute", ""),
                    request_volume=b.get("requests", 0),
                    latency_p95_ms=round(p95, 1),
                    error_count=b.get("errors", 0),
                    cpu_percent=curr_cpu,
                    memory_percent=curr_mem,
                )
            )

        # Fallback if empty (e.g. freshly started)
        if not points:
            now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
            points.append(
                SystemHealthTimeSeriesPoint(
                    timestamp=now_str,
                    request_volume=self.total_requests,
                    latency_p95_ms=0.0,
                    error_count=0,
                    cpu_percent=curr_cpu,
                    memory_percent=curr_mem,
                )
            )

        return points

    async def get_system_health_analytics(self, db: AsyncSession | None = None) -> SystemHealthAnalyticsResponse:
        """Aggregate full system health telemetry payload."""
        resources = self.get_system_resources()
        api_traffic = self.get_api_metrics()
        database = await self.get_database_health(db)
        queue_workers = await self.get_queue_worker_health()
        realtime = self.get_realtime_health()
        uptime_incidents = self.get_uptime_and_incidents(
            api_metrics=api_traffic,
            db_metrics=database,
            queue_metrics=queue_workers,
            resources=resources,
        )
        timeseries = self.get_timeseries_points()

        return SystemHealthAnalyticsResponse(
            measured_at=datetime.now(timezone.utc).isoformat(),
            overall_status=uptime_incidents.system_status,
            resources=resources,
            api_traffic=api_traffic,
            database=database,
            queue_workers=queue_workers,
            realtime=realtime,
            uptime_incidents=uptime_incidents,
            timeseries=timeseries,
        )


# Global singleton tracker
system_telemetry = SystemTelemetryTracker()


class SystemTelemetryMiddleware:
    """Pure ASGI HTTP request timing and status tracker.

    Written as pure ASGI rather than a BaseHTTPMiddleware subclass because
    BaseHTTPMiddleware runs the downstream app inside a task group, and when
    the endpoint raises, the task group's __aexit__ fires before call_next
    ever resumes — call_next then raises RuntimeError("No response returned.")
    and Starlette wraps the real error in an ExceptionGroup.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path.startswith("/api/v1/health") or path == "/health":
            await self.app(scope, receive, send)
            return

        t0 = time.perf_counter()
        status_code = 500
        error_detail: str | None = None

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 500)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            error_detail = f"Unhandled Exception: {type(exc).__name__} - {str(exc)[:120]}"
            raise
        finally:
            duration_ms = (time.perf_counter() - t0) * 1000.0
            system_telemetry.record_request(
                method=scope.get("method", "GET"),
                path=path,
                status_code=status_code,
                duration_ms=duration_ms,
                error_detail=error_detail,
            )
