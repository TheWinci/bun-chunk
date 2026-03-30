#!/bin/bash

# Configuration
APP_NAME="my-app"
VERSION="1.0.0"
LOG_DIR="/var/log/${APP_NAME}"
MAX_RETRIES=3
DEFAULT_PORT=3000

# Source helper scripts
source ./lib/utils.sh

setup_logging() {
  mkdir -p "$LOG_DIR"
  exec > >(tee -a "${LOG_DIR}/app.log") 2>&1
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Logging initialized"
}

log_info() {
  local message="$1"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $message"
}

log_error() {
  local message="$1"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $message" >&2
}

check_dependencies() {
  local deps=("curl" "jq" "git" "docker")

  for dep in "${deps[@]}"; do
    if ! command -v "$dep" &> /dev/null; then
      log_error "Missing dependency: $dep"
      return 1
    fi
  done

  log_info "All dependencies satisfied"
  return 0
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -p|--port)
        PORT="$2"
        shift 2
        ;;
      -e|--env)
        ENVIRONMENT="$2"
        shift 2
        ;;
      -v|--verbose)
        VERBOSE=true
        shift
        ;;
      -h|--help)
        show_help
        exit 0
        ;;
      *)
        log_error "Unknown option: $1"
        exit 1
        ;;
    esac
  done
}

show_help() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -p, --port PORT     Server port (default: ${DEFAULT_PORT})
  -e, --env ENV       Environment (development|staging|production)
  -v, --verbose       Enable verbose logging
  -h, --help          Show this help message
EOF
}

retry_with_backoff() {
  local max_retries=${1:-$MAX_RETRIES}
  local base_delay=${2:-1}
  shift 2

  local attempt=0
  while [ $attempt -lt $max_retries ]; do
    if "$@"; then
      return 0
    fi

    attempt=$((attempt + 1))
    local delay=$((base_delay * (2 ** attempt)))
    log_info "Attempt $attempt failed, retrying in ${delay}s..."
    sleep "$delay"
  done

  log_error "All $max_retries attempts failed"
  return 1
}

start_server() {
  local port="${PORT:-$DEFAULT_PORT}"
  local env="${ENVIRONMENT:-development}"

  log_info "Starting ${APP_NAME} v${VERSION} on port ${port} (${env})"

  check_dependencies || exit 1

  if [ "$env" = "production" ]; then
    log_info "Running in production mode"
    exec node dist/server.js --port="$port"
  else
    log_info "Running in development mode"
    exec bun --hot src/server.ts --port="$port"
  fi
}

cleanup() {
  log_info "Shutting down ${APP_NAME}..."
  # Cleanup temp files
  rm -rf /tmp/${APP_NAME}-*
  log_info "Cleanup complete"
}

trap cleanup EXIT

# Main
parse_args "$@"
setup_logging
start_server
