FROM node:24-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS frontend
WORKDIR /build

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.11-slim@sha256:e88e9763f943ec1834f992a4b51e0f24500486803e8bc534e5767af9ea65f6ce AS python-build
WORKDIR /build

ENV PIP_DISABLE_PIP_VERSION_CHECK=1

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY mixer/ ./mixer/
RUN --mount=type=cache,target=/root/.cache/pip pip install ./mixer

COPY pyproject.toml ./
COPY api/ ./api/
RUN --mount=type=cache,target=/root/.cache/pip pip install .


FROM node:24-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS cli
RUN npm install -g --prefix /opt/cli @anthropic-ai/claude-code @openai/codex


FROM python:3.11-slim@sha256:e88e9763f943ec1834f992a4b51e0f24500486803e8bc534e5767af9ea65f6ce AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    DATA_DIR=/data \
    FRONTEND_DIST=/app/frontend/dist \
    GENERATORS_DIR=/app/generators \
    NUMBA_CACHE_DIR=/tmp/numba-cache \
    MPLCONFIGDIR=/tmp/matplotlib

RUN apt-get update \
    && apt-get install --no-install-recommends -y libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --uid 1000 halcyon

COPY --from=python-build /opt/venv /opt/venv
COPY --from=frontend /build/dist /app/frontend/dist
COPY generators/core /app/generators/core
COPY generators/modal/deploy.py /app/generators/modal/deploy.py

RUN mkdir -p /data && chown halcyon:halcyon /data

USER halcyon
WORKDIR /app
EXPOSE 8001
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health').read()"

CMD ["uvicorn", "api.app.main:app", "--host", "0.0.0.0", "--port", "8001"]


FROM runtime AS runtime-cli

ENV PATH="/opt/cli/bin:$PATH" \
    CLAUDE_CONFIG_DIR=/data/cli/claude \
    CODEX_HOME=/data/cli/codex

COPY --from=cli /usr/local/bin/node /usr/local/bin/node
COPY --from=cli /opt/cli /opt/cli

CMD ["sh", "-c", "mkdir -p \"$CLAUDE_CONFIG_DIR\" \"$CODEX_HOME\" && exec uvicorn api.app.main:app --host 0.0.0.0 --port 8001"]
