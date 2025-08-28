# Playwright CDP Setup for Claude Code

This guide explains how to use Playwright MCP with Claude Code to control your actual browser with all extensions (like MetaMask) already configured.

## Quick Start

1. **Start browser with CDP enabled:**
   ```bash
   bun run browser:cdp
   # or for Chrome: bun run browser:cdp:chrome
   ```

2. **Setup Playwright MCP in Claude Code:**
   ```bash
   bun run playwright:setup
   ```

3. **Restart Claude Code** to apply the MCP configuration

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun run browser:cdp` | Start Brave browser with CDP on port 9222 |
| `bun run browser:cdp:chrome` | Start Chrome browser with CDP on port 9222 |
| `bun run browser:cdp:brave` | Explicitly start Brave browser with CDP |
| `bun run playwright:setup` | Configure Claude Code to use Playwright MCP with CDP |

## What is CDP?

Chrome DevTools Protocol (CDP) allows external tools to control your browser. By starting your browser with CDP enabled, Playwright MCP can:

- Control your actual browser profile with all settings intact
- Use installed extensions like MetaMask
- Access saved passwords and cookies
- Interact with authenticated sessions

## Manual Setup

If you prefer manual configuration:

### 1. Start Browser with CDP

**macOS:**
```bash
"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" --remote-debugging-port=9222
# or for Chrome:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222
```

**Linux:**
```bash
brave-browser --remote-debugging-port=9222
# or
google-chrome --remote-debugging-port=9222
```

**Windows:**
```bash
"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222
# or
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

### 2. Configure Claude Code MCP

```bash
claude mcp add playwright bunx '@playwright/mcp@latest' -- --cdp-endpoint="http://localhost:9222"
```

### 3. Verify Setup

Check if CDP is running:
```bash
curl http://localhost:9222/json/version
```

Check MCP connection in Claude Code:
```bash
claude mcp list
```

## Using Different Ports

If port 9222 is already in use, you can specify a different port:

```bash
# Start browser on custom port
./scripts/start-browser-cdp.sh --port=9333

# Update Claude Code MCP
claude mcp remove playwright
claude mcp add playwright bunx '@playwright/mcp@latest' -- --cdp-endpoint="http://localhost:9333"
```

## Troubleshooting

### Port Already in Use

If you see "Port 9222 is already in use":
```bash
# Find process using the port
lsof -i :9222

# Kill the process (replace PID with actual process ID)
kill -9 PID
```

### MCP Not Connecting

1. Ensure browser is running with CDP enabled
2. Restart Claude Code completely
3. Verify CDP endpoint: `curl http://localhost:9222/json/version`

### Browser Extensions Not Available

Make sure you're using CDP mode (not a fresh browser instance). The button should show "Connect Wallet" instead of "Requires Wallet Extension" when MetaMask is available.

## Benefits of CDP Mode

✅ **Use Real Browser Profile** - All your settings, extensions, and saved data  
✅ **MetaMask Ready** - No need to import wallets or re-authenticate  
✅ **Session Persistence** - Stay logged into services  
✅ **Visual Debugging** - See what Playwright is doing in real-time  
✅ **Extension Support** - All browser extensions work normally  

## Security Note

When running browser with CDP enabled, any application can control it through the debugging port. Only use this in development environments and close the browser when not in use.