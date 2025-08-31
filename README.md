# pay.ubq.fi

A Web3 reward claiming application that enables contributors to claim their Ubiquity rewards through an intuitive interface with support for token swapping via CowSwap.

## Features

- **Wallet Integration**: Connect with MetaMask and other Web3 wallets via Wagmi
- **Permit-based Claims**: Secure ERC20-Permit token claiming without pre-approvals
- **Token Swapping**: Convert rewards to preferred tokens using CowSwap integration
- **Real-time Validation**: Background workers validate permits and check balances
- **Batch Claims**: Claim multiple rewards in a single transaction
- **Persistent Storage**: Supabase backend for tracking claimed permits

## Tech Stack

### Frontend
- **React 19** with TypeScript
- **Vite** for fast builds and HMR
- **Wagmi v2 + Viem v2** for Web3 interactions
- **@uniswap/permit2-sdk** for permit handling
- **@cowprotocol/cow-sdk** for token swaps
- **Web Workers** for background processing

### Backend
- **Hono** web framework
- **Deno** runtime (production)
- **Supabase** for database and authentication
- **Bun** for local development

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [Deno](https://deno.land) (v1.40+)
- MetaMask or compatible Web3 wallet
- Supabase project (for backend)

## Installation

```bash
# Clone the repository
git clone https://github.com/ubiquity/pay.ubq.fi.git
cd pay.ubq.fi

# Install dependencies
bun install

# Install frontend dependencies
cd src/frontend
bun install
cd ../..
```

## Environment Setup

Create a `.env` file in the root directory:

```bash
# Backend (Required for production)
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional: Contract deployment
DEPLOYER_PRIVATE_KEY=deployment_wallet_private_key
ETHERSCAN_API_KEY=for_contract_verification
```

## Development

```bash
# Run both frontend and backend in parallel
bun run dev

# Frontend only (port 5173)
cd src/frontend && bun run dev

# Backend only (port 3000)
bun run src/backend/server.ts
```

### Available Scripts

```bash
# Development
bun run dev          # Start full stack development
bun run start        # Build frontend, then start backend

# Build & Deploy
bun run build        # Build frontend for production
bun run deploy       # Deploy to production (requires setup)

# Code Quality
bun run lint         # Run ESLint
bun run lint:fix     # Fix linting issues
bun run format       # Format with Prettier
bun run typecheck    # TypeScript type checking
bun run knip         # Check for unused code

# Testing
bun run browser:cdp  # Start browser with DevTools Protocol
bun run playwright:setup  # Configure Playwright MCP
```

## Project Structure

```
pay.ubq.fi/
├── src/
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── components/     # React components
│   │   │   ├── hooks/         # Custom React hooks
│   │   │   ├── utils/         # Utility functions
│   │   │   ├── workers/       # Web Workers
│   │   │   ├── constants/     # App constants
│   │   │   └── types.ts       # TypeScript types
│   │   ├── dist/             # Built assets
│   │   └── vite.config.ts    # Vite configuration
│   └── backend/
│       └── server.ts         # Hono server
├── scripts/                  # Build and deployment scripts
├── .claude/                 # Claude Code configuration
└── package.json
```

## Architecture Overview

### Frontend Architecture

The frontend uses a modern React architecture with:

- **Wallet Connection**: Managed through Wagmi hooks (`useAccount`, `useConnect`)
- **Permit Management**: Custom hooks handle permit fetching, validation, and claiming
- **Background Processing**: Web Workers validate permits without blocking the UI
- **State Management**: React Query for server state, localStorage for caching

### Backend Architecture

The backend provides:

- **API Endpoints**: RESTful API for permit recording
- **Static File Serving**: Serves the built frontend application
- **Database Integration**: Supabase for persistent storage
- **CORS Support**: Enabled for cross-origin requests

### Key Components

- **LoginPage**: Handles wallet connection and initial setup
- **DashboardPage**: Main interface for viewing and claiming rewards
- **PermitsTable**: Displays detailed permit information
- **PermitRow**: Individual permit with claim/invalidate actions
- **PreferredTokenSelector**: Choose preferred reward token

### Custom Hooks

- **usePermitData**: Fetches and manages permit data
- **usePermitClaiming**: Handles claim transactions and swaps
- **usePermitInvalidation**: Manages permit invalidation
- **useWalletBalance**: Tracks wallet balances and allowances

## Web3 Integration

### Supported Networks

- Ethereum Mainnet
- Gnosis Chain (xDAI)
- Base
- (Additional networks configurable)

### Token Support

- Native ERC20 tokens
- ERC20-Permit standard
- CowSwap compatible tokens

### Security Features

- Permit-based claiming (no pre-approvals needed)
- Nonce validation to prevent replay attacks
- Server-side validation of claims
- Secure key management

## Production Deployment

### Frontend Build

```bash
cd src/frontend
bun run build
# Output: src/frontend/dist/
```

### Backend Deployment (Deno Deploy)

1. Set up environment variables in Deno Deploy dashboard
2. Configure entry point: `src/backend/server.ts`
3. Deploy using Deno Deploy GitHub integration

### Environment Variables (Production)

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=3000  # Optional, defaults to 3000
```

## Browser Testing

The project includes Playwright MCP integration for automated browser testing:

```bash
# Start browser with Chrome DevTools Protocol
bun run browser:cdp

# Configure Playwright MCP
bun run playwright:setup

# Run with Chrome instead of Brave
bun run browser:cdp:chrome
```

## Troubleshooting

### Common Issues

1. **Port Conflicts**: Frontend uses port 5173, backend uses port 3000
2. **Wallet Connection**: Ensure MetaMask is installed and unlocked
3. **RPC Errors**: Check network configuration and RPC endpoints
4. **Build Failures**: Run `bun run typecheck` to identify TypeScript issues

### Debug Mode

Enable debug logging in the browser console:
```javascript
localStorage.setItem('debug', 'true')
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Use `kebab-case.ts` for file names
- Follow existing code patterns and conventions
- Run `bun run lint:fix` before committing
- Ensure `bun run typecheck` passes
- Write real implementations (no mocks)

## License

This project is part of the Ubiquity DAO ecosystem.

## Support

For issues and questions:
- Open an issue on [GitHub](https://github.com/ubiquity/pay.ubq.fi/issues)

## Acknowledgments

Built with contributions from the Ubiquity DAO community.