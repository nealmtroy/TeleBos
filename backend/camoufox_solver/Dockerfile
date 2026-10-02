# Camoufox Turnstile solver — a Firefox fork needs the full GTK/X/GL stack that
# `python:3.12-slim` does not ship. Without libgtk-3 the browser dies at
# startup with "libgtk-3.so.0: cannot open shared object file".
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    libgtk-3-0 libdbus-glib-1-2 libasound2 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libpangocairo-1.0-0 \
    libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The container runtime denies user-namespace cloning, which Firefox's content
# sandbox needs (clone() fails with EPERM). Turning the sandbox off inside the
# browser is the targeted alternative to running the whole container with
# --security-opt seccomp=unconfined, and it applies to nothing else in the image.
ENV MOZ_DISABLE_CONTENT_SANDBOX=1 \
    MOZ_DISABLE_GMP_SANDBOX=1 \
    MOZ_DISABLE_RDD_SANDBOX=1

# Bakes the browser (~1.5 GB) into the image so start-up is just a launch.
RUN camoufox fetch

COPY main.py .

EXPOSE 8000

# Long poll + navigation means the default 30s would cut healthy solves short.
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
