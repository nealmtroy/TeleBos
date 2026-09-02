#!/usr/bin/env python3
"""TeleBos Synthetic Capacity & Resource Profiler.

Simulates 1,000+ connected accounts and 1,000+ running broadcast jobs
without connecting to any real Telegram servers or requiring live accounts.

Measures:
- Resident Set Size (RSS) RAM usage
- Python heap allocation (tracemalloc)
- CPU utilization %
- Asyncio Event Loop Latency / Lag
- Per-account and per-job resource scaling
- Cleanup / garbage collection efficiency
- Server VPS sizing recommendations

Usage::
    python -m scripts.simulate_capacity --accounts 1000 --jobs 1000 --duration 10
"""

import argparse
import asyncio
import gc
import logging
import os
import sys
import time
import tracemalloc
import uuid
from typing import Any, Callable, Dict, List, Optional

import psutil

# Configure logging
logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("capacity_profiler")


# ==============================================================================
# 1. RESOURCE TRACKER & EVENT LOOP PROFILER
# ==============================================================================

class ResourceTracker:
    """Tracks OS-level RAM, Python heap, CPU usage, and Event Loop lag."""

    def __init__(self) -> None:
        self.process = psutil.Process(os.getpid())
        # Warm up CPU percent counter
        self.process.cpu_percent(interval=None)
        self.baseline_ram_bytes: int = 0
        self._loop_lag_ms: float = 0.0
        self._lag_task: Optional[asyncio.Task] = None
        self._running: bool = False

    def capture_baseline(self) -> None:
        gc.collect()
        self.baseline_ram_bytes = self.process.memory_info().rss

    def get_ram_mb(self) -> float:
        return self.process.memory_info().rss / (1024 * 1024)

    def get_ram_delta_mb(self) -> float:
        return (self.process.memory_info().rss - self.baseline_ram_bytes) / (1024 * 1024)

    def get_cpu_percent(self) -> float:
        return self.process.cpu_percent(interval=None)

    def get_loop_lag_ms(self) -> float:
        return self._loop_lag_ms

    async def _measure_lag_loop(self) -> None:
        """Measure asyncio scheduling delay.
        
        Sleeps for 10ms. If the event loop is idle, it wakes up in ~10ms (lag ~0).
        If the event loop is clogged with heavy synchronous code or tasks,
        the lag increases proportionally.
        """
        expected_interval = 0.010  # 10 ms
        while self._running:
            start = time.perf_counter()
            await asyncio.sleep(expected_interval)
            elapsed = time.perf_counter() - start
            lag = max(0.0, (elapsed - expected_interval) * 1000.0)
            # Exponential moving average for smooth display
            self._loop_lag_ms = (self._loop_lag_ms * 0.7) + (lag * 0.3)

    def start_lag_monitor(self) -> None:
        self._running = True
        self._lag_task = asyncio.create_task(self._measure_lag_loop())

    async def stop_lag_monitor(self) -> None:
        self._running = False
        if self._lag_task:
            self._lag_task.cancel()
            try:
                await self._lag_task
            except asyncio.CancelledError:
                pass


# ==============================================================================
# 2. VIRTUAL TELETHON CLIENT (MOCK OBJECT WITH REALISTIC MEMORY FOOTPRINT)
# ==============================================================================

class MockEntity:
    def __init__(self, entity_id: int, title: str, is_group: bool = False):
        self.id = entity_id
        self.title = title
        self.username = f"user_{entity_id}"
        self.first_name = title
        self.last_name = "Mock"
        self.phone = f"+62812{entity_id:07d}"
        self.megagroup = is_group
        self.creator = False
        self.access_hash = entity_id * 12345
        self.photo = None


class MockDialog:
    def __init__(self, chat_id: int, title: str):
        self.id = chat_id
        self.title = title
        self.name = title
        self.entity = MockEntity(chat_id, title)
        self.is_user = chat_id > 0
        self.is_group = chat_id < 0
        self.is_channel = False
        self.message = None
        self.unread_count = 0


class MockTelegramClient:
    """Mock TelegramClient matching Telethon's in-memory data structures.
    
    Contains realistic internal caches:
    - _entity_cache: maps (id, hash) -> entity (~100 cached entities per client)
    - _event_builders: list of attached handler callbacks
    - _send_queue: asyncio.Queue mimicking in-flight packet buffers
    - session metadata
    """

    def __init__(self, account_id: str, phone: str):
        self.account_id = account_id
        self.phone = phone
        self._connected = True
        self._event_builders: List[tuple] = []
        
        # Simulate realistic Telethon entity cache (50-100 cached dialogs/users)
        self._entity_cache: Dict[tuple, MockEntity] = {}
        for i in range(50):
            entity_id = 100000 + i
            self._entity_cache[(entity_id, entity_id * 99)] = MockEntity(
                entity_id, f"Contact_{i}"
            )
        for i in range(10):
            group_id = -(200000 + i)
            self._entity_cache[(group_id, group_id * 88)] = MockEntity(
                group_id, f"Group_{i}", is_group=True
            )

        self._send_queue: asyncio.Queue = asyncio.Queue(maxsize=100)

    def is_connected(self) -> bool:
        return self._connected

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False
        self._event_builders.clear()
        # Simulate clean shutdown time without actual network I/O
        await asyncio.sleep(0.005)

    def add_event_handler(self, callback: Callable, event_builder: Any = None) -> None:
        self._event_builders.append((callback, event_builder))

    def remove_event_handler(self, callback: Callable, event_builder: Any = None) -> int:
        initial_len = len(self._event_builders)
        self._event_builders = [
            (cb, eb) for cb, eb in self._event_builders if cb != callback
        ]
        return initial_len - len(self._event_builders)

    def on(self, event_builder: Any) -> Callable:
        def decorator(f: Callable) -> Callable:
            self.add_event_handler(f, event_builder)
            return f
        return decorator

    async def get_me(self) -> MockEntity:
        return MockEntity(999999, "Self Account")

    async def get_dialogs(self, limit: int = 100, folder: int = 0) -> List[MockDialog]:
        return [
            MockDialog(100000 + i, f"Chat_{i}") for i in range(min(limit, 50))
        ]

    async def send_message(self, target: Any, text: str, **kwargs) -> Any:
        # Simulate 15ms async network serialization without actual network
        await asyncio.sleep(0.015)
        return True


# ==============================================================================
# 3. BENCHMARK SUITE (ACCOUNTS, BROADCASTS, TRAFFIC STORM)
# ==============================================================================

class CapacitySimulator:
    def __init__(self, tracker: ResourceTracker):
        self.tracker = tracker
        # Active in-memory accounts pool (account_id -> {client, handlers, last_accessed})
        self.mock_pool: Dict[str, Dict[str, Any]] = {}
        # Active broadcast tasks
        self.running_broadcast_tasks: Dict[str, asyncio.Task] = {}
        self._stop_broadcasts: bool = False

    async def simulate_accounts(self, target_count: int, step: int = 250) -> Dict[str, Any]:
        """Progressively load connected accounts into memory and profile resources."""
        print(f"\n" + "=" * 80)
        print(f" [PHASE 1] SIMULATING {target_count:,} CONNECTED ACCOUNTS IN MEMORY")
        print(f" (Allocating mock TelegramClient + 8 Event Handlers per account)")
        print("=" * 80)
        print(f"{'Accounts':>10} | {'RAM Total':>12} | {'Delta RAM':>12} | {'RAM/Account':>14} | {'CPU %':>8} | {'Loop Lag':>10}")
        print("-" * 80)

        current_count = len(self.mock_pool)
        results = []

        while current_count < target_count:
            next_target = min(current_count + step, target_count)
            for i in range(current_count, next_target):
                acc_id = f"acc-{uuid.uuid4().hex[:12]}"
                phone = f"+62812{i:07d}"
                client = MockTelegramClient(acc_id, phone)

                # Attach 8 event handlers matching TeleBos event_relay.py
                handlers = []
                for h_type in ["new_msg", "outgoing", "edited", "deleted", "typing", "action", "profile", "read"]:
                    # Create closure capturing account_id
                    cb = (lambda a_id, ht: (lambda event: None))(acc_id, h_type)
                    client.add_event_handler(cb)
                    handlers.append(cb)

                self.mock_pool[acc_id] = {
                    "client": client,
                    "handlers": handlers,
                    "last_accessed": time.time(),
                }

            current_count = next_target
            # Let event loop settle
            await asyncio.sleep(0.1)

            ram_mb = self.tracker.get_ram_mb()
            delta_mb = self.tracker.get_ram_delta_mb()
            per_acc_kb = (delta_mb * 1024) / max(1, current_count)
            cpu_pct = self.tracker.get_cpu_percent()
            lag_ms = self.tracker.get_loop_lag_ms()

            print(f"{current_count:>10,d} | {ram_mb:>9.1f} MB | {delta_mb:>+9.1f} MB | {per_acc_kb:>11.1f} KB | {cpu_pct:>7.1f}% | {lag_ms:>7.2f} ms")
            results.append({
                "count": current_count,
                "ram_mb": ram_mb,
                "delta_mb": delta_mb,
                "per_acc_kb": per_acc_kb,
                "lag_ms": lag_ms,
            })

        print("-" * 80)
        final_per_acc = results[-1]["per_acc_kb"] if results else 0
        print(f" [RESULT] Total {target_count:,} Connected Accounts: +{self.tracker.get_ram_delta_mb():.1f} MB RAM")
        print(f" [RESULT] Average Memory Per Connected Account: ~{final_per_acc:.1f} KB")
        return {"results": results, "final_per_acc_kb": final_per_acc}

    async def simulate_event_storm(self, events_per_sec: int = 500, duration_sec: int = 5) -> None:
        """Simulate a flood of incoming Telegram events across all connected accounts."""
        if not self.mock_pool:
            return

        print(f"\n" + "=" * 80)
        print(f" [PHASE 2] SIMULATING EVENT STORM ({events_per_sec:,} EVENTS/SEC FOR {duration_sec}s)")
        print(f" (Testing Event Loop CPU and Lag with high concurrent updates)")
        print("=" * 80)

        accounts_list = list(self.mock_pool.values())
        stop_event = asyncio.Event()

        async def worker():
            while not stop_event.is_set():
                # Pick accounts and invoke handlers
                for _ in range(int(events_per_sec / 10)):
                    acc = accounts_list[hash(time.perf_counter_ns()) % len(accounts_list)]
                    # Trigger handlers
                    for cb in acc["handlers"][:2]:
                        cb({"text": "Mock message text", "date": time.time()})
                await asyncio.sleep(0.1)

        storm_task = asyncio.create_task(worker())

        for sec in range(1, duration_sec + 1):
            await asyncio.sleep(1.0)
            cpu = self.tracker.get_cpu_percent()
            lag = self.tracker.get_loop_lag_ms()
            ram = self.tracker.get_ram_mb()
            print(f"  Sec {sec:02d}/{duration_sec:02d}: CPU Usage: {cpu:>5.1f}% | RAM: {ram:>6.1f} MB | Event Loop Lag: {lag:>5.2f} ms")

        stop_event.set()
        await storm_task
        print(" [RESULT] Event Storm completed cleanly.")

    async def simulate_broadcast_jobs(self, target_jobs: int, duration_sec: int = 10, step: int = 250) -> Dict[str, Any]:
        """Simulate concurrent running broadcast jobs executing loops."""
        print(f"\n" + "=" * 80)
        print(f" [PHASE 3] SIMULATING {target_jobs:,} CONCURRENT RUNNING BROADCAST JOBS")
        print(f" (Simulating async worker loops, randomized delay tickers, and DB state)")
        print("=" * 80)
        print(f"{'Jobs':>10} | {'RAM Total':>12} | {'Delta RAM':>12} | {'RAM/Job':>14} | {'CPU %':>8} | {'Loop Lag':>10}")
        print("-" * 80)

        self._stop_broadcasts = False
        accounts = list(self.mock_pool.values())

        async def _mock_broadcast_worker(job_id: str, client: MockTelegramClient):
            """Simulates one broadcast job loop with delays and sends."""
            msg_counter = 0
            while not self._stop_broadcasts:
                # Randomized broadcast delay between 2 and 5 seconds
                delay = 2.0 + (hash(job_id) % 30) / 10.0
                try:
                    await asyncio.sleep(delay)
                    if self._stop_broadcasts:
                        break
                    # Send mock message
                    await client.send_message("target_group", f"Broadcast payload #{msg_counter}")
                    msg_counter += 1
                except asyncio.CancelledError:
                    break

        current_jobs = len(self.running_broadcast_tasks)
        base_ram_before_jobs = self.tracker.get_ram_mb()

        while current_jobs < target_jobs:
            next_target = min(current_jobs + step, target_jobs)
            for i in range(current_jobs, next_target):
                job_id = f"job-{uuid.uuid4().hex[:12]}"
                client = accounts[i % len(accounts)]["client"] if accounts else MockTelegramClient(f"temp-{i}", "+62")
                task = asyncio.create_task(_mock_broadcast_worker(job_id, client))
                self.running_broadcast_tasks[job_id] = task

            current_jobs = next_target
            await asyncio.sleep(0.2)

            ram_mb = self.tracker.get_ram_mb()
            delta_mb = ram_mb - base_ram_before_jobs
            per_job_kb = (delta_mb * 1024) / max(1, current_jobs)
            cpu_pct = self.tracker.get_cpu_percent()
            lag_ms = self.tracker.get_loop_lag_ms()

            print(f"{current_jobs:>10,d} | {ram_mb:>9.1f} MB | {delta_mb:>+9.1f} MB | {per_job_kb:>11.1f} KB | {cpu_pct:>7.1f}% | {lag_ms:>7.2f} ms")

        print("-" * 80)
        print(f" Letting {target_jobs:,} broadcast jobs run concurrently for {duration_sec} seconds...")
        for sec in range(1, duration_sec + 1):
            await asyncio.sleep(1.0)
            cpu = self.tracker.get_cpu_percent()
            lag = self.tracker.get_loop_lag_ms()
            if sec % 3 == 0 or sec == duration_sec:
                print(f"  [Running] Sec {sec:02d}/{duration_sec:02d}: CPU: {cpu:>5.1f}% | Event Loop Lag: {lag:>5.2f} ms | Active Tasks: {len(asyncio.all_tasks()):,}")

        # Stop and cleanup jobs
        self._stop_broadcasts = True
        for task in self.running_broadcast_tasks.values():
            task.cancel()
        await asyncio.gather(*self.running_broadcast_tasks.values(), return_exceptions=True)
        self.running_broadcast_tasks.clear()
        gc.collect()

        print(f" [RESULT] All {target_jobs:,} broadcast jobs stopped and reclaimed.")
        return {"target_jobs": target_jobs}

    async def simulate_disconnect_and_gc(self, disconnect_ratio: float = 0.5) -> None:
        """Simulate disconnecting accounts to verify memory reclamation (Memory Leak Test)."""
        print(f"\n" + "=" * 80)
        print(f" [PHASE 4] DISCONNECT & GARBAGE COLLECTION TEST")
        print(f" (Disconnecting {int(disconnect_ratio * 100)}% of accounts and testing memory release)")
        print("=" * 80)

        total_before = len(self.mock_pool)
        to_disconnect_count = int(total_before * disconnect_ratio)
        ram_before = self.tracker.get_ram_mb()

        # Detach and disconnect cleanly
        keys_to_remove = list(self.mock_pool.keys())[:to_disconnect_count]
        for key in keys_to_remove:
            entry = self.mock_pool.pop(key)
            client = entry["client"]
            for handler in entry["handlers"]:
                client.remove_event_handler(handler)
            await client.disconnect()

        del keys_to_remove
        gc.collect()
        await asyncio.sleep(0.2)

        ram_after = self.tracker.get_ram_mb()
        freed_mb = ram_before - ram_after

        print(f" Total Accounts Before: {total_before:,}")
        print(f" Disconnected Accounts: {to_disconnect_count:,}")
        print(f" Remaining Active:     {len(self.mock_pool):,}")
        print(f" RAM Before Eviction:   {ram_before:.1f} MB")
        print(f" RAM After Eviction:    {ram_after:.1f} MB")
        print(f" RAM Successfully Freed: {freed_mb:+.1f} MB")
        print("=" * 80)


# ==============================================================================
# 4. SERVER SIZING & CAPACITY ADVISORY REPORT
# ==============================================================================

def print_server_recommendations(per_acc_kb: float, per_job_kb: float) -> None:
    cpu_count = psutil.cpu_count(logical=True) or 2
    total_ram_gb = psutil.virtual_memory().total / (1024 ** 3)
    available_ram_gb = psutil.virtual_memory().available / (1024 ** 3)

    print("\n" + "=" * 80)
    print(" [PHASE 5] AUTOMATED VPS CAPACITY RECOMMENDATION REPORT")
    print("=" * 80)
    print(f" Current Machine Hardware:")
    print(f"  * CPU Cores:       {cpu_count} Logical Cores")
    print(f"  * Total RAM:       {total_ram_gb:.2f} GB")
    print(f"  * Available RAM:   {available_ram_gb:.2f} GB")
    print("-" * 80)

    # Standard VPS Tiers
    vps_tiers = [
        {"name": "VPS Entry (2 vCPU / 2 GB RAM)", "cores": 2, "usable_ram_mb": 1100},
        {"name": "VPS Standard (2 vCPU / 4 GB RAM)", "cores": 2, "usable_ram_mb": 2800},
        {"name": "VPS Pro (4 vCPU / 8 GB RAM)", "cores": 4, "usable_ram_mb": 6200},
        {"name": "VPS Scale (8 vCPU / 16 GB RAM)", "cores": 8, "usable_ram_mb": 13500},
    ]

    safe_per_acc_kb = max(per_acc_kb, 450.0)  # Safe buffer (450KB per account)
    safe_per_job_kb = 120.0  # Safe buffer per broadcast task

    print(f"{'VPS Specification':<32} | {'Max Connected Accounts':<23} | {'Max Concurrent Broadcasts':<25}")
    print("-" * 85)

    for tier in vps_tiers:
        # 70% of usable RAM for accounts, 30% for broadcast jobs
        max_acc = int((tier["usable_ram_mb"] * 0.7 * 1024) / safe_per_acc_kb)
        # Broadcast limit is bounded by CPU & RAM
        max_jobs = int(min(
            (tier["usable_ram_mb"] * 0.3 * 1024) / safe_per_job_kb,
            tier["cores"] * 350,  # ~350 concurrent async jobs per core
        ))
        print(f"{tier['name']:<32} | ~{max_acc:>6,d} accounts        | ~{max_jobs:>6,d} concurrent jobs")

    print("-" * 85)
    print(" [NOTE]: 'Connected Accounts' means active accounts kept in RAM pool with event handlers.")
    print(" Stored accounts in PostgreSQL database are virtually UNLIMITED and only bounded by disk.")
    print("=" * 80 + "\n")


# ==============================================================================
# 5. ENTRY POINT & CLI PARSER
# ==============================================================================

async def main():
    parser = argparse.ArgumentParser(
        description="TeleBos Synthetic Capacity & Resource Profiler (CPU, RAM, Event Loop)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--accounts", type=int, default=1000, help="Number of mock connected accounts to simulate")
    parser.add_argument("--jobs", type=int, default=1000, help="Number of concurrent broadcast jobs to simulate")
    parser.add_argument("--events", type=int, default=300, help="Event storm traffic per second")
    parser.add_argument("--duration", type=int, default=8, help="Duration of broadcast stress test in seconds")
    parser.add_argument("--step", type=int, default=250, help="Step size for incremental reporting")
    args = parser.parse_args()

    print("\n" + "=" * 80)
    print("       TELEBOS SYNTHETIC CAPACITY & PERFORMANCE PROFILER")
    print("       (Zero Network Connection - 100% Mocked & Safe)")
    print("=" * 80)
    print(f" Configuration:")
    print(f"  * Target Connected Accounts: {args.accounts:,}")
    print(f"  * Target Broadcast Jobs:     {args.jobs:,}")
    print(f"  * Event Storm Frequency:     {args.events:,} events/sec")
    print(f"  * Stress Test Duration:      {args.duration} seconds")
    print("=" * 80)

    # Initialize tracker
    tracker = ResourceTracker()
    tracker.capture_baseline()
    tracker.start_lag_monitor()

    base_ram = tracker.get_ram_mb()
    print(f" Baseline Process Memory: {base_ram:.1f} MB RAM | Python PID: {os.getpid()}")

    simulator = CapacitySimulator(tracker)

    try:
        # Phase 1: Accounts Simulation
        acc_result = await simulator.simulate_accounts(args.accounts, step=args.step)

        # Phase 2: Event Storm Simulation
        if args.events > 0:
            await simulator.simulate_event_storm(events_per_sec=args.events, duration_sec=5)

        # Phase 3: Broadcast Jobs Simulation
        if args.jobs > 0:
            await simulator.simulate_broadcast_jobs(args.jobs, duration_sec=args.duration, step=args.step)

        # Phase 4: Disconnect & GC Verification
        await simulator.simulate_disconnect_and_gc(disconnect_ratio=0.5)

        # Phase 5: Sizing Advisory Report
        print_server_recommendations(
            per_acc_kb=acc_result.get("final_per_acc_kb", 420.0),
            per_job_kb=120.0,
        )

    finally:
        await tracker.stop_lag_monitor()


if __name__ == "__main__":
    asyncio.run(main())
