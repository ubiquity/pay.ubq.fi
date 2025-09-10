#!/bin/bash

# Playwright MCP Browser CDP Setup Script
# Starts a Chrome browser instance with Chrome DevTools Protocol enabled
# for automated browser testing and interaction via Playwright MCP

set -euo pipefail

# Script configuration
SCRIPT_NAME="start-browser-cdp.sh"
SCRIPT_VERSION="1.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default configuration
DEFAULT_CDP_PORT="9222"
DEFAULT_CDP_HOST="localhost"
DEFAULT_USER_DATA_DIR="${PROJECT_ROOT}/.playwright-mcp/user-data"
DEFAULT_DOWNLOADS_DIR="${PROJECT_ROOT}/.playwright-mcp/downloads"
DEFAULT_HEADLESS="false"
DEFAULT_TIMEOUT="30"

# Environment variable overrides
CDP_PORT="${PLAYWRIGHT_CDP_PORT:-$DEFAULT_CDP_PORT}"
CDP_HOST="${PLAYWRIGHT_CDP_HOST:-$DEFAULT_CDP_HOST}"
USER_DATA_DIR="${BROWSER_USER_DATA_DIR:-$DEFAULT_USER_DATA_DIR}"
DOWNLOADS_DIR="${BROWSER_DOWNLOADS_DIR:-$DEFAULT_DOWNLOADS_DIR}"
HEADLESS="${PLAYWRIGHT_HEADLESS:-$DEFAULT_HEADLESS}"
TIMEOUT="${PLAYWRIGHT_TIMEOUT:-$DEFAULT_TIMEOUT}"

# Browser executable paths (in order of preference)
CHROME_PATHS=(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
    "/opt/google/chrome/chrome"
    "/usr/bin/google-chrome"
    "/usr/bin/google-chrome-stable"
    "/usr/bin/chromium"
    "/usr/bin/chromium-browser"
    "/snap/bin/chromium"
    "$(which google-chrome 2>/dev/null || echo '')"
    "$(which chromium 2>/dev/null || echo '')"
    "$(which chrome 2>/dev/null || echo '')"
)

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

# Help function
show_help() {
    cat << EOF
$SCRIPT_NAME v$SCRIPT_VERSION - Playwright MCP Browser CDP Setup

Usage: $SCRIPT_NAME [OPTIONS]

Starts a Chrome browser instance with Chrome DevTools Protocol enabled
for automated browser testing and interaction via Playwright MCP.

Options:
  -p, --port PORT          CDP port (default: $DEFAULT_CDP_PORT)
  -h, --host HOST          CDP host (default: $DEFAULT_CDP_HOST)
  -u, --user-data DIR      User data directory (default: $DEFAULT_USER_DATA_DIR)
  -d, --downloads DIR      Downloads directory (default: $DEFAULT_DOWNLOADS_DIR)
  --headless               Run in headless mode
  --headed                 Run in headed mode (default)
  -t, --timeout SECONDS    Startup timeout (default: $DEFAULT_TIMEOUT)
  --kill                   Kill existing Chrome processes first
  --check                  Check if CDP browser is running
  --stop                   Stop CDP browser
  --help                   Show this help message
  --version                Show version information

Environment Variables:
  PLAYWRIGHT_CDP_PORT      Override CDP port
  PLAYWRIGHT_CDP_HOST      Override CDP host
  BROWSER_USER_DATA_DIR    Override user data directory
  BROWSER_DOWNLOADS_DIR    Override downloads directory
  PLAYWRIGHT_HEADLESS      Set to 'true' for headless mode
  PLAYWRIGHT_TIMEOUT       Override startup timeout

Examples:
  $SCRIPT_NAME                         # Start with default settings
  $SCRIPT_NAME --port 9223            # Use custom port
  $SCRIPT_NAME --headless              # Run headless
  $SCRIPT_NAME --kill                  # Kill existing processes first
  $SCRIPT_NAME --check                 # Check if running

EOF
}

# Version information
show_version() {
    echo "$SCRIPT_NAME version $SCRIPT_VERSION"
}

# Find Chrome executable
find_chrome_executable() {
    local chrome_exec=""
    
    # Check custom path from environment
    if [[ -n "${BROWSER_EXECUTABLE_PATH:-}" ]] && [[ -x "$BROWSER_EXECUTABLE_PATH" ]]; then
        chrome_exec="$BROWSER_EXECUTABLE_PATH"
    else
        # Search for Chrome in common locations
        for path in "${CHROME_PATHS[@]}"; do
            if [[ -n "$path" ]] && [[ -x "$path" ]]; then
                chrome_exec="$path"
                break
            fi
        done
    fi
    
    if [[ -z "$chrome_exec" ]]; then
        log_error "Chrome executable not found. Please install Chrome or set BROWSER_EXECUTABLE_PATH."
        return 1
    fi
    
    echo "$chrome_exec"
    return 0
}

# Check if CDP browser is running
check_cdp_browser() {
    local response
    if response=$(curl -s "http://${CDP_HOST}:${CDP_PORT}/json/version" 2>/dev/null); then
        local browser_version
        browser_version=$(echo "$response" | grep -o '"Browser":"[^"]*"' | cut -d'"' -f4 || echo "Unknown")
        log_success "CDP browser is running on port $CDP_PORT"
        log_info "Browser version: $browser_version"
        return 0
    else
        log_warn "CDP browser is not running on port $CDP_PORT"
        return 1
    fi
}

# Kill existing Chrome processes
kill_chrome_processes() {
    log_info "Killing existing Chrome processes..."
    
    # Kill processes using the CDP port
    if lsof -ti:"$CDP_PORT" >/dev/null 2>&1; then
        log_info "Killing process using port $CDP_PORT"
        kill -TERM $(lsof -ti:"$CDP_PORT") 2>/dev/null || true
        sleep 2
        kill -KILL $(lsof -ti:"$CDP_PORT") 2>/dev/null || true
    fi
    
    # Kill Chrome processes with remote debugging
    pkill -f "chrome.*remote-debugging-port" 2>/dev/null || true
    pkill -f "chromium.*remote-debugging-port" 2>/dev/null || true
    
    sleep 2
    log_success "Chrome processes killed"
}

# Create necessary directories
setup_directories() {
    log_info "Setting up directories..."
    
    mkdir -p "$USER_DATA_DIR"
    mkdir -p "$DOWNLOADS_DIR"
    mkdir -p "${PROJECT_ROOT}/.playwright-mcp/screenshots"
    mkdir -p "${PROJECT_ROOT}/.playwright-mcp/videos"
    mkdir -p "${PROJECT_ROOT}/.playwright-mcp/traces"
    
    log_success "Directories created"
}

# Start CDP browser
start_cdp_browser() {
    local chrome_exec
    if ! chrome_exec=$(find_chrome_executable); then
        return 1
    fi
    
    log_info "Starting CDP browser..."
    log_info "Chrome executable: $chrome_exec"
    log_info "CDP endpoint: http://${CDP_HOST}:${CDP_PORT}"
    log_info "User data directory: $USER_DATA_DIR"
    log_info "Downloads directory: $DOWNLOADS_DIR"
    log_info "Headless mode: $HEADLESS"
    
    setup_directories
    
    # Build Chrome arguments
    local chrome_args=(
        "--remote-debugging-port=$CDP_PORT"
        "--remote-debugging-address=$CDP_HOST"
        "--user-data-dir=$USER_DATA_DIR"
        "--no-first-run"
        "--no-default-browser-check"
        "--disable-default-apps"
        "--disable-popup-blocking"
        "--disable-translate"
        "--disable-background-timer-throttling"
        "--disable-backgrounding-occluded-windows"
        "--disable-renderer-backgrounding"
        "--disable-features=TranslateUI"
        "--disable-component-extensions-with-background-pages"
        "--no-sandbox"
        "--disable-dev-shm-usage"
        "--disable-web-security"
        "--allow-running-insecure-content"
        "--ignore-certificate-errors"
        "--ignore-ssl-errors"
        "--ignore-certificate-errors-spki-list"
        "--disable-extensions-except"
    )
    
    # Add headless mode if requested
    if [[ "$HEADLESS" == "true" ]]; then
        chrome_args+=("--headless=new")
    fi
    
    # Add downloads directory
    chrome_args+=("--download-default-directory=$DOWNLOADS_DIR")
    
    # Start Chrome in background
    log_info "Launching Chrome with CDP enabled..."
    "$chrome_exec" "${chrome_args[@]}" > /dev/null 2>&1 &
    local chrome_pid=$!
    
    # Wait for CDP to be available
    log_info "Waiting for CDP to be ready (timeout: ${TIMEOUT}s)..."
    local count=0
    while ! check_cdp_browser >/dev/null 2>&1; do
        if [[ $count -ge $TIMEOUT ]]; then
            log_error "Timeout waiting for CDP browser to start"
            kill $chrome_pid 2>/dev/null || true
            return 1
        fi
        sleep 1
        ((count++))
    done
    
    log_success "CDP browser started successfully (PID: $chrome_pid)"
    log_info "CDP endpoint available at: http://${CDP_HOST}:${CDP_PORT}"
    log_info "Browser DevTools: http://${CDP_HOST}:${CDP_PORT}/devtools/inspector.html"
    
    # Save PID for later reference
    echo $chrome_pid > "${PROJECT_ROOT}/.playwright-mcp/chrome.pid"
    
    return 0
}

# Stop CDP browser
stop_cdp_browser() {
    log_info "Stopping CDP browser..."
    
    local pid_file="${PROJECT_ROOT}/.playwright-mcp/chrome.pid"
    if [[ -f "$pid_file" ]]; then
        local chrome_pid
        chrome_pid=$(cat "$pid_file")
        if kill -0 "$chrome_pid" 2>/dev/null; then
            kill -TERM "$chrome_pid"
            sleep 2
            if kill -0 "$chrome_pid" 2>/dev/null; then
                kill -KILL "$chrome_pid"
            fi
            log_success "CDP browser stopped (PID: $chrome_pid)"
        else
            log_warn "CDP browser process not found (PID: $chrome_pid)"
        fi
        rm -f "$pid_file"
    else
        kill_chrome_processes
    fi
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -p|--port)
                CDP_PORT="$2"
                shift 2
                ;;
            -h|--host)
                CDP_HOST="$2"
                shift 2
                ;;
            -u|--user-data)
                USER_DATA_DIR="$2"
                shift 2
                ;;
            -d|--downloads)
                DOWNLOADS_DIR="$2"
                shift 2
                ;;
            --headless)
                HEADLESS="true"
                shift
                ;;
            --headed)
                HEADLESS="false"
                shift
                ;;
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            --kill)
                kill_chrome_processes
                exit 0
                ;;
            --check)
                if check_cdp_browser; then
                    exit 0
                else
                    exit 1
                fi
                ;;
            --stop)
                stop_cdp_browser
                exit 0
                ;;
            --help)
                show_help
                exit 0
                ;;
            --version)
                show_version
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Main function
main() {
    log_info "$SCRIPT_NAME v$SCRIPT_VERSION starting..."
    
    parse_args "$@"
    
    # Check if already running
    if check_cdp_browser >/dev/null 2>&1; then
        log_warn "CDP browser is already running on port $CDP_PORT"
        log_info "Use --stop to stop it or --kill to force kill existing processes"
        return 0
    fi
    
    # Start the browser
    if start_cdp_browser; then
        log_success "Setup complete. CDP browser is ready for Playwright MCP automation."
        return 0
    else
        log_error "Failed to start CDP browser"
        return 1
    fi
}

# Handle script interruption
trap 'log_warn "Script interrupted. Cleaning up..."; exit 1' INT TERM

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi