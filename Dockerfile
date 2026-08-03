FROM node:24-slim AS frontend
WORKDIR /build

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.11-slim AS python-build
WORKDIR /build

ENV PIP_DISABLE_PIP_VERSION_CHECK=1

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY mixer/ ./mixer/
RUN --mount=type=cache,target=/root/.cache/pip pip install ./mixer

COPY pyproject.toml ./
COPY api/ ./api/
RUN --mount=type=cache,target=/root/.cache/pip pip install .


FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    DATA_DIR=/data \
    FRONTEND_DIST=/app/frontend/dist \
    NUMBA_CACHE_DIR=/tmp/numba-cache \
    MPLCONFIGDIR=/tmp/matplotlib

RUN apt-get update \
    && apt-get install --no-install-recommends -y libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --uid 1000 halcyon

COPY --from=python-build /opt/venv /opt/venv
COPY --from=frontend /build/dist /app/frontend/dist

RUN mkdir -p /data && chown halcyon:halcyon /data

USER halcyon
WORKDIR /app
EXPOSE 8001
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health').read()"

CMD ["uvicorn", "api.app.main:app", "--host", "0.0.0.0", "--port", "8001"]
