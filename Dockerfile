# Two images from one file.
#   web     the Next.js workbench on port 3150, reading data/demo/derived/case.json
#   engine  the Python engine CLI with FFmpeg, for `frametrail fixtures` and `frametrail analyse`
# docker-compose.yml builds both and shares ./data between them.

FROM python:3.12-slim-bookworm AS engine
COPY --from=ghcr.io/astral-sh/uv:0.5.14 /uv /uvx /bin/
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
# Dependencies first, so a code change does not reinstall NumPy and OpenCV.
COPY engine/pyproject.toml engine/uv.lock engine/
RUN uv sync --project engine --frozen --no-dev --no-install-project
COPY engine engine
RUN uv sync --project engine --frozen --no-dev
ENTRYPOINT ["/app/engine/.venv/bin/frametrail"]
CMD ["analyse"]

FROM node:24-bookworm-slim AS web
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && mkdir /app && chown node:node /app
USER node
WORKDIR /app
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @frametrail/web
COPY --chown=node:node apps/web apps/web
COPY --chown=node:node data/demo data/demo
RUN pnpm --filter @frametrail/web build
WORKDIR /app/apps/web
EXPOSE 3150
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3150/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["pnpm", "start"]
