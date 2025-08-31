# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# pay.ubq.fi - Project Rules & Development Guide

## Project Overview
pay.ubq.fi is a Web3 reward claiming application built on a hybrid frontend/backend architecture with React 19, TypeScript, and Web3 integration.

## Architecture

### Frontend
- **Framework**: React 19 with Vite build tool
- **Runtime**: Bun (local development)
- **Language**: TypeScript with strict type checking
- **Styling**: Vanilla CSS with responsive grid system (`grid-styles.css`, `ubiquity-styles.css`)
- **Web3**: Wagmi v2 + Viem v2 for Ethereum interactions
- **State Management**: Custom hooks (`usePermitData`, `usePermitClaiming`) with React Query for server state
- **Background Processing**: Web Workers for permit checking (`permit-checker.worker.ts`)

### Backend  
- **Framework**: Hono web framework
- **Runtime**: Deno (production deployment), Bun (local development)
- **Database**: Supabase with TypeScript types
- **Deployment**: Deno Deploy
- **API**: RESTful endpoints for permit recording

### Key Dependencies
- **Web3**: `@uniswap/permit2-sdk`, `@ubiquity-dao/permit2-rpc-client`, `@cowprotocol/cow-sdk`
- **UI**: React 19, react-dom, react-router-dom
- **Dev Tools**: ESLint 9, Prettier, TypeScript 5.7+, Knip for unused code detection

## Development Commands

### Root Level (uses Bun)
```bash
bun run dev          # Start both frontend and backend in parallel
bun run start        # Build frontend then start backend
bun run build        # Build frontend for production
bun run lint         # Lint entire src/ directory
bun run lint:fix     # Fix linting issues automatically
bun run format       # Format code with Prettier
bun run typecheck    # TypeScript type checking
bun run knip         # Check for unused code
```

### Frontend Specific
```bash
cd src/frontend
bun run dev          # Start Vite dev server on port 5173
bun run build        # Build for production
bun run lint         # Lint frontend code
```

### Backend Specific  
```bash
cd src/backend
# Development
bun run dev          # Run with Deno (--allow-all flags)
# Production
deno run --allow-net --allow-read --allow-env --env-file server.ts
```

### Browser Testing (Playwright MCP)
```bash
bun run browser:cdp       # Start Brave with Chrome DevTools Protocol
bun run browser:cdp:chrome # Start Chrome with CDP
bun run playwright:setup  # Configure Claude Code MCP
```

## File Structure & Conventions

### Naming Conventions
- **Files**: Use `kebab-case.ts` not `camelCase.ts`
- **Components**: PascalCase for component files and exports
- **Hooks**: `use-hook-name.ts` with camelCase function names
- **Utils**: `utility-name.ts` with descriptive function names

### Directory Structure
```
src/
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/         # Custom hooks
│   │   ├── utils/         # Utility functions
│   │   ├── workers/       # Web Workers
│   │   ├── constants/     # App constants
│   │   └── types.ts       # TypeScript types
│   ├── dist/             # Built assets
│   └── vite.config.ts    # Vite configuration
├── backend/
│   └── server.ts         # Hono server
└── scripts/              # Build and deployment scripts
```

## Runtime & Package Management

### Use Bun for:
- Installing packages: `bun install`
- Running TypeScript files: `bun run file.ts`
- Development scripts: `bun run dev`
- Package scripts: Use `bunx` instead of `npx`

### Use Deno for:
- Backend production deployment
- Backend development (see backend package.json scripts)
- Always use `--allow-all` flag to avoid permission prompts

### Environment Variables
- **Root**: Backend variables in `.env` (Supabase, deployment keys)
- **Frontend**: Uses `VITE_` prefixed variables
- **Never**: Overwrite `.env` files - append only, edit `.env.example` instead

## Code Quality & Best Practices

### TypeScript
- Use strict mode with `noUnusedLocals` and `noUnusedParameters`
- Prefer explicit types over `any`
- Use path aliases: `@/*` for frontend, `@backend/*` for backend

### React 19 Best Practices
- Use function components and hooks exclusively
- Custom hooks for complex state logic
- Web Workers for heavy computations
- Proper error boundaries and loading states
- Server Actions for backend communication (if applicable)

### State Management
- **Local State**: `useState` for component-specific data
- **Shared Logic**: Custom hooks (`usePermitData`, `usePermitClaiming`)
- **Caching**: localStorage for permit data and user preferences
- **Server State**: React Query for API calls and caching

### Web3 Integration
- **Wallet Connection**: Wagmi's `useAccount`, `useConnect` hooks
- **Contract Interaction**: Viem for low-level Ethereum operations
- **Permit Handling**: Custom utilities with Permit2 SDK
- **Token Swapping**: CowSwap SDK integration for reward conversions

## Caching Strategy

### Frontend Caching
- **Permit Data**: `localStorage` with `PermitDataCache` key
- **User Preferences**: Preferred reward token selection
- **Timestamps**: Last check timestamp for cache invalidation
- **Balance/Allowance**: In-memory caching with Map structures

### Cache Invalidation
- Clear cache on wallet disconnect
- Update cache on successful claims
- Background worker updates via postMessage

## Testing & Quality Assurance

### Linting & Formatting
- **ESLint 9**: Flat config with TypeScript ESLint
- **Prettier**: Code formatting with consistent style
- **Knip**: Dead code elimination

### Browser Testing
- **Playwright MCP**: Automated browser testing with real extensions
- **CDP Mode**: Test with actual MetaMask and wallet extensions
- **Visual Testing**: Real browser interaction for Web3 flows

## Known Issues & Focus Areas

### Development Focus
- **CowSwap Integration**: Complete implementation with real SDK usage

## Deployment

### Frontend Build Process
```bash
cd src/frontend && bun run build
# Outputs to src/frontend/dist/
```

### Backend Deployment (Deno Deploy)
- **Entry Point**: `src/backend/server.ts`
- **Environment Variables**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Static Files**: Served from `src/frontend/dist/`

### Required Environment Variables
```bash
# Backend
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Contract Deployment (if needed)
DEPLOYER_PRIVATE_KEY=deployment_wallet_private_key
ETHERSCAN_API_KEY=for_contract_verification
```

## Performance Optimizations

### Vite Configuration
- **HMR**: Disabled for stability (`hmr: false`)
- **CSS**: Single bundle (`cssCodeSplit: false`)
- **Workers**: ES module format for modern browsers
- **Polyfills**: Node.js polyfills for crypto libraries

### Runtime Optimizations
- **Web Workers**: Background permit validation
- **Caching**: Aggressive localStorage usage
- **Code Splitting**: Vite automatic splitting
- **Tree Shaking**: Dead code elimination with Knip

## Security Considerations

### Web3 Security
- **Private Key**: Never stored in frontend, only MetaMask integration
- **Permit Validation**: Server-side validation with Supabase
- **RPC Calls**: Proper error handling for failed transactions
- **Nonce Management**: Prevent replay attacks with proper nonce checking

### Environment Security
- **API Keys**: Service role keys only in backend environment
- **CORS**: Properly configured for production domains
- **Input Validation**: Sanitize all user inputs and addresses

## Troubleshooting

### Development Issues
- **Port Conflicts**: Frontend (5173), Backend (3000/8000)
- **Permission Errors**: Use `--allow-all` with Deno
- **Build Failures**: Check TypeScript errors and dependencies

### Web3 Issues
- **Wallet Connection**: Verify MetaMask is installed and network is correct
- **Transaction Failures**: Check gas, nonce, and permit validity
- **RPC Errors**: Implement retry logic and fallback providers

## Development Workflow

1. **Setup**: `bun install` in root directory
2. **Development**: `bun run dev` for full stack development  
3. **Testing**: Use Playwright MCP for Web3 testing with real wallets
4. **Linting**: `bun run lint:fix && bun run format` before commits
5. **Type Checking**: `bun run typecheck` to verify TypeScript
6. **Build**: `bun run build` before deployment
7. **Deployment**: Build frontend, deploy backend to Deno Deploy

## Important Notes

- **DO NOT**: Fix lint errors unless specifically requested
- **ALWAYS**: Use Bun for TypeScript execution, not Node.js directly  
- **PREFER**: Real implementations over mocks - this is MVP software
- **MINIMIZE**: Shell commands per turn - combine with `&&` when possible
- **NEVER**: Pass code directly to shell (e.g., `bun -e 'code'`) - always write to file first
- **TEST**: Use Playwright MCP with real browser extensions for Web3 testing

