#!/usr/bin/env bash
# Runs a load test on a Linux VM (GCP) inside the load-test image (Dockerfile.load), in the
# background, so it keeps going if the SSH session drops. See docs/load-test.md ("Running on GCP").
#
# Usage (in the project folder on the VM, with .env present):
#   LOAD_PROBES=2 LOAD_STEP=baseline-2 bash scripts/gcp/load.sh probe
#   LOAD_K6_VUS=10 LOAD_STEP=k6-10 LOAD_K6_DURATION=15m bash scripts/gcp/load.sh k6
#   LOAD_K6_VUS=8 LOAD_PROBES=2 LOAD_STEP=hybrid-10 LOAD_BASELINE=baseline-2_run1 bash scripts/gcp/load.sh hybrid
# Optional: LOAD_RUN_ID (results folder name), REBUILD=1 (rebuild the image after code changes).
#
# Results: test-logs/load/<run id>/ on the VM; console log: test-logs/load/<run id>.console.log
set -euo pipefail

MODE="${1:-}"
case "$MODE" in
  probe) SCRIPT="load:probe" ;;
  k6) SCRIPT="load:k6" ;;
  hybrid) SCRIPT="load:hybrid" ;;
  *)
    echo "Usage: bash scripts/gcp/load.sh probe|k6|hybrid   (variables: see docs/load-test.md)"
    exit 1
    ;;
esac

[ -f .env ] || { echo ".env not found in $(pwd). Copy it from your PC first (never commit it)."; exit 1; }

IMAGE="mvlearn-load"
if [ "${REBUILD:-0}" = "1" ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building $IMAGE (first time takes a few minutes)..."
  docker build -f Dockerfile.load -t "$IMAGE" .
fi

LABEL="${LOAD_STEP:-$MODE}"
RUN_ID="${LOAD_RUN_ID:-$(date +%Y-%m-%d_%H-%M-%S)_${LABEL}}"
mkdir -p test-logs/load test-results

# Pass only the load-test settings that are set; credentials come from .env, mounted read-only and
# read by dotenv like on Windows (docker --env-file would keep the quotes around quoted values).
ENV_ARGS=(-e "LOAD_RUN_ID=$RUN_ID")
for name in TARGET LOAD_PROBES LOAD_STEP LOAD_BASELINE LOAD_K6_VUS LOAD_K6_DURATION LOAD_K6_RAMP \
  LOAD_K6_SESSION_MINUTES LOAD_HYBRID_WARMUP_S LOAD_CPU_LIMIT LOAD_CPU_ABORT; do
  if [ -n "${!name:-}" ]; then ENV_ARGS+=(-e "$name=${!name}"); fi
done

CONTAINER="mvlearn-${RUN_ID//[^a-zA-Z0-9_.-]/-}"
# --ipc=host: Chromium needs more shared memory than Docker's default 64 MB.
# --init: forwards signals and reaps the many browser processes.
docker run -d --name "$CONTAINER" --ipc=host --init \
  -v "$(pwd)/.env:/app/.env:ro" "${ENV_ARGS[@]}" \
  -v "$(pwd)/test-logs:/app/test-logs" \
  -v "$(pwd)/test-results:/app/test-results" \
  "$IMAGE" npm run "$SCRIPT" >/dev/null

# Keep a copy of the console output next to the results, even after the container is removed.
nohup sh -c "docker logs -f '$CONTAINER' > 'test-logs/load/$RUN_ID.console.log' 2>&1" >/dev/null 2>&1 &

echo "Started $SCRIPT as container $CONTAINER (run id $RUN_ID)."
echo "  Follow it:   docker logs -f $CONTAINER      (Ctrl+C stops following, not the run)"
echo "  Stop it:     docker stop $CONTAINER"
echo "  Results:     test-logs/load/$RUN_ID/  (summary.md, k6-summary.md)"
echo "  When done:   docker rm $CONTAINER"
