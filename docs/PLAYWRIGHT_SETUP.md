# Playwright MCP Browser Automation Setup

This guide provides comprehensive instructions for setting up Playwright MCP (Model Context Protocol) browser automation in the Ubiquity Pay project.

## Overview

Playwright MCP enables automated browser interactions through the Chrome DevTools Protocol (CDP), allowing for sophisticated testing, web scraping, and browser automation tasks.

## Prerequisites

- Node.js 18+ or Bun runtime
- Chrome/Chromium browser installed
- Project dependencies installed via `bun install`
- MCP server infrastructure configured

## Installation

### 1. Install Playwright Dependencies

```bash
# Install Playwright browser binaries
bunx playwright install chromium

# Install additional dependencies if needed
bun add -D playwright @playwright/test
```

### 2. MCP Server Configuration

The MCP server configuration should be added to your project's MCP settings:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-playwright"],
      "env": {
        "PLAYWRIGHT_CDP_PORT": "9222"
      }
    }
  }
}
```

### 3. CDP Browser Setup

Use the provided script to start a CDP-enabled Chrome instance:

```bash
# Make the script executable
chmod +x scripts/start-browser-cdp.sh

# Start CDP browser
./scripts/start-browser-cdp.sh
```

## Configuration

### Environment Variables

Add these variables to your `.env` file:

```env
# Playwright MCP Configuration
PLAYWRIGHT_CDP_PORT=9222
PLAYWRIGHT_CDP_HOST=localhost
PLAYWRIGHT_HEADLESS=false
PLAYWRIGHT_SLOW_MO=100
PLAYWRIGHT_TIMEOUT=30000

# Browser Settings
BROWSER_EXECUTABLE_PATH=/opt/google/chrome/chrome
BROWSER_USER_DATA_DIR=./.playwright-mcp/user-data
BROWSER_DOWNLOADS_DIR=./.playwright-mcp/downloads
```

### Playwright Configuration File

Create `playwright.config.ts` in the project root:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: [
        '--remote-debugging-port=9222',
        '--disable-web-security',
        '--disable-dev-shm-usage',
        '--no-sandbox'
      ]
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ],
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
```

## Usage Examples

### Basic Browser Automation

```typescript
import { chromium } from 'playwright';

async function automatePayFlow() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    await page.goto('http://localhost:3000');
    await page.click('[data-testid="connect-wallet"]');
    await page.waitForSelector('[data-testid="wallet-connected"]');
    
    // Perform payment automation
    await page.fill('[data-testid="amount-input"]', '100');
    await page.click('[data-testid="pay-button"]');
    
    console.log('Payment flow completed successfully');
  } finally {
    await context.close();
  }
}
```

### MCP Integration Example

```typescript
import { MCPClient } from '@modelcontextprotocol/client';

async function mcpBrowserAutomation() {
  const client = new MCPClient();
  await client.connect('playwright');
  
  const result = await client.callTool('playwright_navigate', {
    url: 'http://localhost:3000/claims',
    waitFor: 'networkidle'
  });
  
  const claimData = await client.callTool('playwright_extract_data', {
    selector: '[data-testid="claim-item"]',
    attribute: 'data-claim-id'
  });
  
  return claimData;
}
```

## Directory Structure

```
.playwright-mcp/
├── user-data/          # Chrome user data directory
├── downloads/          # Downloaded files
├── screenshots/        # Test screenshots
├── videos/            # Test recordings
└── traces/            # Playwright traces
```

## Testing

### Run Playwright Tests

```bash
# Run all tests
bunx playwright test

# Run tests in headed mode
bunx playwright test --headed

# Run specific test file
bunx playwright test tests/e2e/payment-flow.spec.ts

# Show test report
bunx playwright show-report
```

### Debug Tests

```bash
# Debug mode with browser inspector
bunx playwright test --debug

# Generate traces for failed tests
bunx playwright test --trace on
```

## Troubleshooting

### Common Issues

1. **CDP Connection Failed**
   ```bash
   # Ensure Chrome is running with CDP enabled
   ./scripts/start-browser-cdp.sh
   ```

2. **Permission Denied**
   ```bash
   # Fix script permissions
   chmod +x scripts/start-browser-cdp.sh
   ```

3. **Port Already in Use**
   ```bash
   # Kill existing Chrome processes
   pkill -f "chrome.*remote-debugging-port"
   ```

4. **Browser Not Found**
   ```bash
   # Install Chrome/Chromium
   bunx playwright install chromium
   ```

### Debug Logging

Enable debug logging for troubleshooting:

```bash
export DEBUG=pw:api,pw:browser
bunx playwright test
```

## Security Considerations

- CDP exposes browser debugging capabilities
- Only run CDP browsers in development environments
- Restrict CDP port access in production
- Use secure user data directories
- Regularly clear browser cache and data

## Performance Optimization

- Use `--disable-dev-shm-usage` for containers
- Configure appropriate timeout values
- Limit concurrent browser instances
- Clean up browser contexts after use
- Use page pooling for multiple operations

## Integration with CI/CD

```yaml
# GitHub Actions example
- name: Setup Playwright
  run: bunx playwright install --with-deps chromium

- name: Run Playwright tests
  run: bunx playwright test
  env:
    PLAYWRIGHT_HEADLESS: true
```

For more advanced configurations and examples, refer to the official Playwright documentation and MCP server specifications.