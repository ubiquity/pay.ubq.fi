# pay.ubq.fi - Multi-Chain Permit Claiming Platform

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-multi--chain-orange.svg)

A comprehensive Web3 application for claiming ERC20 and ERC721 permits across multiple blockchain networks. Built with modern React, TypeScript, and optimized for performance with Web Workers and advanced caching.

## 🌟 Features

### Core Functionality
- **Multi-Chain Support**: Seamlessly interact with Ethereum, Gnosis Chain, Base, and more
- **Permit Claiming**: Efficient claiming of both ERC20 and ERC721 permits
- **Token Swapping**: Integrated CoW Protocol support for optimal reward conversion
- **Batch Operations**: Claim multiple permits in a single transaction for gas efficiency
- **Real-Time Validation**: Background validation using Web Workers for non-blocking UX

### Advanced Features
- **Smart Caching**: Multi-layer caching system with TTL for optimal performance
- **Quote Management**: Intelligent quote caching for token swap estimates
- **Error Handling**: Comprehensive error states with user-friendly messaging
- **Performance Optimized**: React.memo, useMemo, and useCallback for minimal re-renders
- **Visual Polish**: Proper number formatting preventing rounding display issues

### Technical Excellence
- **TypeScript First**: Full type safety across the entire codebase
- **Modern Architecture**: Clean separation between frontend and backend services
- **Web Workers**: Heavy computations moved to background threads
- **Enhanced Logging**: Structured logging with rate limiting and batching
- **Build Optimization**: Advanced Vite configuration with chunk splitting

## 🏗️ Architecture

```
├── backend/                # Hono.js API server
│   ├── server.ts          # Main server with Supabase integration
│   └── package.json       # Backend dependencies
├── frontend/              # React + TypeScript application
│   ├── src/
│   │   ├── components/    # React components with performance optimizations
│   │   ├── hooks/         # Custom React hooks for business logic
│   │   ├── utils/         # Utility functions and helpers
│   │   ├── workers/       # Web Workers for background processing
│   │   ├── constants/     # Configuration and constants
│   │   └── types.ts       # TypeScript type definitions
│   └── vite.config.ts     # Optimized build configuration
├── scripts/               # Deployment and utility scripts
└── lib/                   # Smart contract dependencies
```

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js 18+
- A modern web browser with Web3 wallet support
- Access to supported blockchain networks

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ubiquity/pay.ubq.fi.git
   cd pay.ubq.fi
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Environment Setup**
   ```bash
   # Root environment for backend
   cp .env.example .env
   
   # Frontend environment
   cp frontend/.env.example frontend/.env
   ```

4. **Configure Environment Variables**
   
   **Backend (.env):**
   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   DEPLOYER_PRIVATE_KEY=your_deployer_wallet_private_key
   ETHERSCAN_API_KEY=your_etherscan_api_key
   ```
   
   **Frontend (frontend/.env):**
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_RPC_URL=your_blockchain_rpc_endpoint
   ```

5. **Start Development Servers**
   ```bash
   # Start both frontend and backend concurrently
   bun run dev
   
   # Or start individually:
   bun run _frontend  # Frontend only (port 5173)
   bun run _backend   # Backend only (port 8000)
   ```

6. **Build for Production**
   ```bash
   bun run start  # Builds frontend and starts production server
   ```

## 🌐 Supported Networks

| Network | Chain ID | Status | Features |
|---------|----------|--------|---------|
| Ethereum Mainnet | 1 | ✅ Active | Full Support |
| Gnosis Chain | 100 | ✅ Active | Full Support |
| Base | 8453 | ✅ Active | Full Support |
| Optimism | 10 | 🔄 Testing | Limited |
| Polygon | 137 | 🔄 Testing | Limited |
| Arbitrum One | 42161 | 🔄 Testing | Limited |

## 🛠️ Development

### Project Structure

**Frontend Components:**
- `DashboardPage`: Main application interface with permit management
- `PermitRow`: Optimized individual permit display (React.memo)
- `PermitsTable`: Efficient table rendering with virtualization
- `RewardPreferenceSelector`: Token preference management

**Key Hooks:**
- `usePermitData`: Data fetching with enhanced caching
- `usePermitClaiming`: Claim transaction management
- `usePermitQuoting`: Token swap quote handling

**Web Workers:**
- `permit-checker.worker.ts`: Background permit validation and RPC calls

**Utilities:**
- `logger.ts`: Enhanced logging system with rate limiting
- `permit-utils.ts`: Core permit manipulation functions
- `cowswap-utils.ts`: Token swap integration

### Performance Features

**Caching System:**
- Permit data cached for 5 minutes
- Quote data cached for 2 minutes
- Intelligent cache invalidation
- LocalStorage persistence

**Optimization Techniques:**
- React.memo for component memoization
- useMemo for expensive calculations
- useCallback for stable function references
- Code splitting with dynamic imports
- Build optimization with Terser

### Code Quality

**TypeScript Configuration:**
- Strict type checking enabled
- Path mapping for clean imports
- Generated types from Supabase schema

**Development Tools:**
- ESLint with TypeScript rules
- Hot Module Replacement (HMR)
- Source maps in development
- Bundle analysis tools

## 📊 API Documentation

### Backend Endpoints

**Health Check:**
```http
GET /api/health
```

**Permit Data:**
```http
GET /api/permits?address={wallet_address}&chainId={chain_id}
```

**Transaction Recording:**
```http
POST /api/transactions
Content-Type: application/json

{
  "hash": "0x...",
  "permitNonce": "123",
  "networkId": 1
}
```

### Frontend Architecture

**State Management:**
- React hooks for local state
- Context for global application state
- Web Workers for background state

**Data Flow:**
```
User Action → Hook → Web Worker → RPC/API → Cache → UI Update
```

## 🔧 Configuration

### Vite Configuration

The application uses an optimized Vite setup:

```javascript
// Advanced build optimizations
build: {
  minify: 'terser',
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ['react', 'react-dom'],
        crypto: ['viem', '@uniswap/permit2-sdk'],
        ui: ['@tanstack/react-query', 'react-router-dom']
      }
    }
  },
  sourcemap: true,
  chunkSizeWarningLimit: 1000
}
```

### Environment Variables

**Required for Backend:**
- `SUPABASE_URL`: Database connection
- `SUPABASE_SERVICE_ROLE_KEY`: Admin database access
- `DEPLOYER_PRIVATE_KEY`: Contract deployment (if needed)
- `ETHERSCAN_API_KEY`: Contract verification

**Required for Frontend:**
- `VITE_SUPABASE_URL`: Public database access
- `VITE_SUPABASE_ANON_KEY`: Client-side database key
- `VITE_RPC_URL`: Blockchain RPC endpoint

## 🚀 Deployment

### Frontend Deployment

```bash
# Build optimized production bundle
cd frontend
bun run build

# Deploy to your preferred platform
bun run deploy
```

### Backend Deployment

The backend is designed to run on various platforms:

**Local/VPS:**
```bash
bun run backend/server.ts
```

**Docker:**
```dockerfile
FROM oven/bun:alpine
WORKDIR /app
COPY . .
RUN bun install
EXPOSE 8000
CMD ["bun", "run", "backend/server.ts"]
```

## 🧪 Testing

### Running Tests

```bash
# Frontend tests
cd frontend
bun test

# E2E tests
bun run test:e2e

# Type checking
bun run type-check
```

### Performance Testing

```bash
# Bundle analysis
bun run analyze

# Lighthouse audit
bun run audit
```

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines

- Follow TypeScript strict mode
- Use conventional commit messages
- Add tests for new features
- Update documentation as needed
- Ensure performance optimizations are maintained

## 📋 Troubleshooting

### Common Issues

**Build Errors:**
```bash
# Clear cache and reinstall
rm -rf node_modules bun.lock
bun install
```

**Environment Issues:**
- Ensure all required environment variables are set
- Check that `.env` files are not committed to version control
- Verify Supabase credentials and RPC endpoints

**Performance Issues:**
- Check browser developer tools for console warnings
- Monitor network requests in the Network tab
- Use React Developer Tools Profiler

### Getting Help

- 📖 Check this documentation first
- 🐛 Open an issue for bugs
- 💡 Start a discussion for feature requests
- 📧 Contact the development team

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Ubiquity DAO** for project vision and support
- **CoW Protocol** for DEX aggregation integration  
- **Uniswap** for Permit2 SDK
- **Supabase** for backend infrastructure
- **Viem** for Ethereum interactions
- **React Team** for the excellent framework

---

**Built with ❤️ by the Ubiquity DAO community**
