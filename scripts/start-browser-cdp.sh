#!/bin/bash

# ======================================
# Playwright CDP Browser Setup Script
# ======================================
# 
# This script starts Brave/Chrome browser with Chrome DevTools Protocol (CDP) enabled
# for use with Playwright MCP in Claude Code, allowing you to control your actual
# browser with all extensions (like MetaMask) already installed and configured.
#
# Usage:
#   ./scripts/start-browser-cdp.sh [options]
#
# Options:
#   --browser=brave|chrome  Browser to use (default: brave)
#   --port=PORT            CDP port to use (default: 9222)
#   --help                 Show this help message
#
# Examples:
#   ./scripts/start-browser-cdp.sh
#   ./scripts/start-browser-cdp.sh --browser=chrome
#   ./scripts/start-browser-cdp.sh --port=9333
#
# Once running, configure Claude Code MCP:
#   claude mcp add playwright bunx '@playwright/mcp@latest' -- --cdp-endpoint="http://localhost:9222"
#
# ======================================

set -e

# Default values
BROWSER="brave"
PORT="9222"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --browser=*)
      BROWSER="${1#*=}"
      shift
      ;;
    --port=*)
      PORT="${1#*=}"
      shift
      ;;
    --help)
      grep "^#" "$0" | grep -v "^#!/bin/bash" | sed 's/^# //' | sed 's/^#//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Detect OS
OS="$(uname -s)"

# Browser paths based on OS and browser choice
get_browser_path() {
  local browser=$1
  local os=$2
  
  case "$os" in
    Darwin) # macOS
      case "$browser" in
        brave)
          echo "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
          ;;
        chrome)
          echo "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
          ;;
        *)
          echo "Error: Unknown browser: $browser" >&2
          exit 1
          ;;
      esac
      ;;
    Linux)
      case "$browser" in
        brave)
          echo "brave-browser"
          ;;
        chrome)
          echo "google-chrome"
          ;;
        *)
          echo "Error: Unknown browser: $browser" >&2
          exit 1
          ;;
      esac
      ;;
    MINGW*|CYGWIN*|MSYS*) # Windows (Git Bash)
      case "$browser" in
        brave)
          echo "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"
          ;;
        chrome)
          echo "C:/Program Files/Google/Chrome/Application/chrome.exe"
          ;;
        *)
          echo "Error: Unknown browser: $browser" >&2
          exit 1
          ;;
      esac
      ;;
    *)
      echo "Error: Unsupported operating system: $os" >&2
      exit 1
      ;;
  esac
}

# Get browser executable path
BROWSER_PATH=$(get_browser_path "$BROWSER" "$OS")

# Check if browser exists
if [[ "$OS" == "Darwin" ]] || [[ "$OS" == "Linux" ]]; then
  if ! [[ -f "$BROWSER_PATH" ]] && ! command -v "$BROWSER_PATH" &> /dev/null; then
    echo "Error: Browser not found at: $BROWSER_PATH"
    echo "Please install ${BROWSER^} browser or use --browser option to select a different browser"
    exit 1
  fi
fi

# Check if CDP port is already in use
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Warning: Port $PORT is already in use."
  echo "Browser might already be running with CDP enabled."
  echo ""
  echo "To verify CDP is working, run:"
  echo "  curl http://localhost:$PORT/json/version"
  echo ""
  echo "To kill the existing process and start fresh:"
  echo "  lsof -ti:$PORT | xargs kill -9"
  echo ""
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Kill any existing browser instances (optional - commented out for safety)
# echo "Closing existing browser instances..."
# pkill -f "$BROWSER_PATH" 2>/dev/null || true
# sleep 2

echo "======================================" 
echo "Starting ${BROWSER^} with CDP on port $PORT"
echo "======================================" 
echo ""
echo "Browser: $BROWSER_PATH"
echo "CDP Port: $PORT"
echo ""

# Start browser with CDP
echo "Starting browser..."
"$BROWSER_PATH" \
  --remote-debugging-port=$PORT \
  --remote-debugging-address=127.0.0.1 \
  --enable-automation \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --disable-features=TranslateUI \
  --disable-ipc-flooding-protection \
  --no-first-run &

# Give browser time to start
sleep 3

# Verify CDP is working
echo ""
echo "Verifying CDP connection..."
if curl -s -f "http://localhost:$PORT/json/version" > /dev/null 2>&1; then
  echo "✓ CDP is active and ready!"
  echo ""
  echo "Browser info:"
  curl -s "http://localhost:$PORT/json/version" | grep -E '"Browser"|"Protocol-Version"' | sed 's/^/  /'
  echo ""
  echo "======================================" 
  echo "Setup Instructions for Claude Code:"
  echo "======================================" 
  echo ""
  echo "1. If you haven't already added Playwright MCP, run:"
  echo "   claude mcp add playwright bunx '@playwright/mcp@latest' -- --cdp-endpoint=\"http://localhost:$PORT\""
  echo ""
  echo "2. If Playwright MCP is already added, update it:"
  echo "   claude mcp remove playwright"
  echo "   claude mcp add playwright bunx '@playwright/mcp@latest' -- --cdp-endpoint=\"http://localhost:$PORT\""
  echo ""
  echo "3. Restart Claude Code to apply changes"
  echo ""
  echo "The browser will stay open. Press Ctrl+C in this terminal to stop."
  echo "======================================" 
  
  # Keep script running to maintain browser process
  wait
else
  echo "✗ Failed to verify CDP connection"
  echo ""
  echo "Troubleshooting:"
  echo "1. Check if browser started successfully"
  echo "2. Try a different port with --port=PORT"
  echo "3. Check firewall/security settings"
  exit 1
fi
