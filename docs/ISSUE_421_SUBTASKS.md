# Issue #421 Subtasks: Permits Not Showing Up

## Parent Issue: [#421 - Permits not showing up](https://github.com/ubiquity/pay.ubq.fi/issues/421)

**Status:** OPEN  
**Priority:** Priority: 0 (Regression)  
**Assignee:** 0x4007  

### Description
Recent changes have introduced a bug where not all of the permits are shown. This issue is being resolved by implementing all missing features from the `development-broken` branch. Progress is tracked through the following sub-tasks.

---

## Phase 1: Infrastructure Setup

### [#425 - Set up shared src/ directory structure](https://github.com/ubiquity/pay.ubq.fi/issues/425)
**Status:** OPEN  
**Priority:** Priority: 2 (Medium)  
**Price:** 75 USD  
**Time Estimate:** 30 minutes  

**Overview:** Reorganize the project structure to use a shared src/ directory containing both backend and frontend code.

**Tasks:**
- [ ] Move `backend/` → `src/backend/`
- [ ] Move `frontend/` → `src/frontend/`
- [ ] Update all import paths and references
- [ ] Update GitHub Actions workflow paths
- [ ] Test that both frontend and backend still work correctly

**Acceptance Criteria:**
- All code is organized under `src/` directory
- No broken imports or references
- CI/CD pipeline works correctly
- Both development and production builds succeed

**Migration Reference:**
- From: `development-broken` branch commits
- Files: Major directory restructuring (99 files affected)
- Priority: Infrastructure foundation required for other features

---

### [#426 - Configure root-level build tools and configs](https://github.com/ubiquity/pay.ubq.fi/issues/426)
**Status:** OPEN  
**Priority:** Priority: 2 (Medium)  
**Price:** 75 USD  
**Time Estimate:** 20 minutes  

**Overview:** Set up consolidated configuration files at the project root for better development experience.

**Tasks:**
- [ ] Add `eslint.config.js` at project root (52 lines)
- [ ] Add `knip.jsonc` for dead code detection (33 lines)
- [ ] Add `tsconfig.json` at project root (42 lines)
- [ ] Move `.prettierrc` to root level
- [ ] Add `.prettierignore` at root (12 lines)
- [ ] Configure VS Code settings for Deno/TypeScript

**Acceptance Criteria:**
- ESLint works across entire project
- TypeScript compilation works from root
- Prettier formats all files consistently
- Dead code detection runs successfully
- VS Code provides proper IntelliSense

**Migration Reference:**
- From: `development-broken` branch
- Key commits: eslint.config.js, knip.jsonc, tsconfig.json additions
- Files: Root configuration consolidation

---

### [#427 - Update package.json and dependencies](https://github.com/ubiquity/pay.ubq.fi/issues/427)
**Status:** OPEN  
**Priority:** Priority: 2 (Medium)  
**Price:** 75 USD  
**Time Estimate:** 15 minutes  

**Overview:** Update project dependencies and package configuration to match the advanced branch state.

**Tasks:**
- [ ] Update root `package.json` with new dependencies
- [ ] Remove unused dependencies and submodules
- [ ] Move `@types/node-fetch` to devDependencies
- [ ] Remove git submodules: `lib/forge-std`, `lib/permit2`
- [ ] Update frontend package.json
- [ ] Verify all dependencies install correctly

**Acceptance Criteria:**
- All required packages install without errors
- No unused dependencies remain
- Package lock files are updated
- Submodules are properly removed from git

**Migration Reference:**
- From: `development-broken` branch package changes
- Files: package.json, bun.lock, .gitmodules
- Dependency changes: 471 additions, 37 deletions in bun.lock

---

## Phase 2: Core Functionality

### [#428 - Implement Permit3 ABI integration](https://github.com/ubiquity/pay.ubq.fi/issues/428)
**Status:** OPEN  
**Priority:** Priority: 4 (Urgent)  
**Price:** 150 USD  
**Time Estimate:** 45 minutes  

**Overview:** Critical migration from Permit2 to Permit3 contract interface. This is the most important feature to restore application functionality.

**Tasks:**
- [ ] Add `src/frontend/src/fixtures/permit3-abi.json` (970 lines)
- [ ] Update `use-permit-claiming.ts` to use Permit3 ABI and addresses
- [ ] Update `use-permit-invalidation.ts` for Permit3 compatibility
- [ ] Update `permit-checker.worker.ts` validation logic
- [ ] Remove old Permit2 ABI files
- [ ] Test permit claiming with new contract

**Acceptance Criteria:**
- Permit3 ABI is properly imported and typed
- All permit claiming functionality works
- Permit invalidation works correctly
- Worker validation passes
- No references to old Permit2 remain

**Migration Reference:**
- From: `development-broken` branch commit f8f2a86
- Files: 970 lines of new ABI, multiple hook updates
- This is the core contract change that enables all other features

---

### [#429 - Implement permit invalidation functionality](https://github.com/ubiquity/pay.ubq.fi/issues/429)
**Status:** OPEN  
**Priority:** Priority: 3 (High)  
**Price:** 112.5 USD  
**Time Estimate:** 30 minutes  

**Overview:** Add comprehensive permit invalidation feature allowing users to invalidate their permits with full transaction support.

**Tasks:**
- [ ] Create `src/frontend/src/hooks/use-permit-invalidation.ts` (93 lines)
- [ ] Implement invalidation transaction logic
- [ ] Add UI components for invalidation actions
- [ ] Update permit row component to show invalidation options
- [ ] Add proper error handling and user feedback
- [ ] Test invalidation workflow end-to-end

**Acceptance Criteria:**
- Users can invalidate their permits successfully
- Transaction hashes are captured and displayed
- Proper error states are shown
- Invalidated permits are removed from UI
- Blockchain transactions complete successfully

**Migration Reference:**
- From: `development-broken` branch
- New file: `use-permit-invalidation.ts` (93 lines)
- Related UI component updates

---

### [#430 - Implement GitHub username integration and caching](https://github.com/ubiquity/pay.ubq.fi/issues/430)
**Status:** OPEN  
**Priority:** Priority: 1 (Normal)  
**Price:** 37.5 USD  
**Time Estimate:** 45 minutes  

**Overview:** Add GitHub username fetching and caching system to display user-friendly names instead of wallet addresses.

**Tasks:**
- [ ] Create `src/frontend/src/hooks/use-github-usernames.ts` (97 lines)
- [ ] Create `src/frontend/src/utils/github-cache.ts` (48 lines)
- [ ] Create `src/frontend/src/utils/format-utils.ts` (34 lines)
- [ ] Implement GitHub API integration with rate limiting
- [ ] Add 30-day caching for usernames
- [ ] Update permit row component to display GitHub usernames
- [ ] Handle GitHub API errors gracefully

**Acceptance Criteria:**
- GitHub usernames display correctly in permit rows
- Caching reduces API calls effectively
- Rate limiting prevents API quota exhaustion
- Fallback to wallet addresses when username unavailable
- Cache persists across browser sessions

**Migration Reference:**
- From: `development-broken` branch commits
- New files: Multiple utilities for GitHub integration
- Enhanced user experience with recognizable names

---

### [#431 - Enhanced permit data management and batch claiming](https://github.com/ubiquity/pay.ubq.fi/issues/431)
**Status:** OPEN  
**Priority:** Priority: 3 (High)  
**Price:** 225 USD  
**Time Estimate:** 90 minutes  

**Overview:** Improve permit data fetching, filtering, and batch claiming logic with better error handling and performance.

**Tasks:**
- [ ] Update `src/frontend/src/hooks/use-permit-data.ts` with enhanced logic (296 lines)
- [ ] Implement beneficiary and owner permit retrieval
- [ ] Add proper permit filtering and validation
- [ ] Update batch claiming to use `permitsToClaim`
- [ ] Implement error clearing on successful operations
- [ ] Add wallet switch handling to clear permits
- [ ] Optimize database queries with left joins

**Acceptance Criteria:**
- Permits load correctly for both owners and beneficiaries
- Batch claiming works without errors
- Permits clear properly on wallet switches
- Database queries handle null values correctly
- Performance is improved with better caching

**Migration Reference:**
- From: `development-broken` branch permit data improvements
- File updates: Enhanced hook logic and database handling
- Critical for core permit functionality

---

## Phase 3: Technical Improvements

### [#432 - Add Playwright MCP browser automation support](https://github.com/ubiquity/pay.ubq.fi/issues/432)
**Status:** OPEN  
**Priority:** Priority: 1 (Normal)  
**Price:** 37.5 USD  
**Time Estimate:** 30 minutes  

**Overview:** Implement Playwright MCP integration for advanced browser automation, testing, and debugging capabilities.

**Tasks:**
- [ ] Add `docs/PLAYWRIGHT_SETUP.md` documentation (149 lines)
- [ ] Create `scripts/start-browser-cdp.sh` setup script (210 lines)
- [ ] Configure Playwright MCP in project settings
- [ ] Add `.playwright-mcp/` to `.gitignore`
- [ ] Set up CDP (Chrome DevTools Protocol) browser automation
- [ ] Test browser automation functionality
- [ ] Document usage and setup procedures

**Acceptance Criteria:**
- Playwright MCP is properly configured
- Browser automation scripts work
- CDP integration functions correctly
- Documentation is complete and accurate
- Developers can easily set up and use the tools

**Migration Reference:**
- From: `development-broken` branch Playwright commits
- Files: Setup documentation and automation scripts
- Enhancement for development and testing workflow

---

### [#433 - Update database types and improve type safety](https://github.com/ubiquity/pay.ubq.fi/issues/433)
**Status:** OPEN  
**Priority:** Priority: 1 (Normal)  
**Price:** 37.5 USD  
**Time Estimate:** 20 minutes  

**Overview:** Update Supabase database types to match current schema and improve TypeScript type safety across the application.

**Tasks:**
- [ ] Update `src/frontend/src/database.types.ts` with latest Supabase schema (767 lines)
- [ ] Add proper type imports to backend `server.ts`
- [ ] Update frontend type definitions
- [ ] Remove unused database tables and types
- [ ] Add helper types (Tables, TablesInsert, TablesUpdate, Enums)
- [ ] Test all database operations with new types

**Acceptance Criteria:**
- All TypeScript compilation passes without errors
- Database operations are fully typed
- No 'any' types used for database interactions
- Schema matches production database exactly
- All queries return properly typed results

**Migration Reference:**
- From: `development-broken` branch database type updates
- Files: database.types.ts regeneration from Supabase CLI
- Critical for type safety and preventing runtime errors

---

### [#434 - Implement debug configuration system](https://github.com/ubiquity/pay.ubq.fi/issues/434)
**Status:** OPEN  
**Priority:** Priority: 0 (Regression)  
**Time Estimate:** 30 minutes  

**Overview:** Add environment-based debug configuration system for better development and troubleshooting capabilities.

**Tasks:**
- [ ] Implement debug flag configuration system
- [ ] Add environment variable support for debug modes
- [ ] Create debug utilities and logging helpers
- [ ] Update components to use debug flags appropriately
- [ ] Add development vs production debug handling
- [ ] Document debug configuration options

**Acceptance Criteria:**
- Debug flags can be controlled via environment variables
- Different debug levels work correctly
- Production builds have debug disabled by default
- Debug logging is helpful and not overwhelming
- Configuration is documented and easy to use

**Migration Reference:**
- From: `development-broken` branch debug system commits
- Files: Debug configuration and environment handling
- Improvement for development experience

---

## Phase 4: Quality and Polish

### [#435 - Fix visual rounding issues for rewards display](https://github.com/ubiquity/pay.ubq.fi/issues/435)
**Status:** OPEN  
**Priority:** Priority: 0 (Regression)  
**Time Estimate:** 15 minutes  

**Overview:** Fix visual rounding issues in rewards display to ensure accurate and consistent amount showing.

**Tasks:**
- [ ] Locate all components displaying reward amounts (e.g. permit-row.tsx)
- [ ] Implement proper number formatting to avoid visual rounding errors
- [ ] Use appropriate libraries if needed for big decimals
- [ ] Test with various amount values, including decimals
- [ ] Ensure consistent display across different permit types

**Acceptance Criteria:**
- Reward amounts display without unexpected rounding
- Decimal places are handled correctly
- No visual discrepancies between displayed and actual values

**Migration Reference:**
- From Visual and UX Improvements in migration guide
- Related files: format-utils.ts, permit-row.tsx

---

### [#436 - Eliminate console warnings and improve error handling](https://github.com/ubiquity/pay.ubq.fi/issues/436)
**Status:** OPEN  
**Priority:** Priority: 1 (Normal)  
**Price:** 37.5 USD  
**Time Estimate:** 30 minutes  

**Overview:** Eliminate 300+ console warnings from invalid permit validation and improve overall error handling across the application.

**Tasks:**
- [ ] Fix invalid permit validation in worker that causes warnings
- [ ] Update error handling in permit-related components
- [ ] Improve error states and user feedback messages
- [ ] Remove any remaining console.log statements
- [ ] Add proper error boundaries where needed
- [ ] Test error scenarios thoroughly

**Acceptance Criteria:**
- Zero console warnings in browser developer tools
- Proper error states shown to users
- No unhandled promise rejections
- Error messages are helpful and actionable
- Application handles edge cases gracefully

**Migration Reference:**
- From: `development-broken` branch console warnings fix
- Files: Worker validation logic and error handling improvements
- Quality of life improvement for development and users

---

### [#437 - Optimize performance and caching improvements](https://github.com/ubiquity/pay.ubq.fi/issues/437)
**Status:** OPEN  
**Priority:** Priority: 0 (Regression)  
**Price:** 0 USD  
**Time Estimate:** 45 minutes  

**Overview:** Optimize application performance and improve caching mechanisms.

**Tasks:**
- [ ] Update Vite configuration for better build optimization
- [ ] Enhance caching in github-cache.ts, extend duration
- [ ] Improve rate limiting for API calls
- [ ] Profile application and optimize slow components
- [ ] Add memoization where appropriate

**Acceptance Criteria:**
- Build times improved
- API calls reduced through better caching
- Application loads and responds faster
- No rate limit errors

**Migration Reference:**
- From Technical Improvements in guide
- Files: vite.config.ts, github-cache.ts

---

### [#438 - Update documentation and cleanup](https://github.com/ubiquity/pay.ubq.fi/issues/438)
**Status:** OPEN  
**Priority:** Priority: 0 (Regression)  
**Price:** 0 USD  
**Time Estimate:** 30 minutes  

**Overview:** Update project documentation to reflect new architecture and remove outdated information.

**Tasks:**
- [ ] Update main `README.md` with current project structure (238 lines added)
- [ ] Remove outdated documentation files (15,000+ lines deleted)
- [ ] Create up-to-date setup and development guides
- [ ] Document new features and APIs
- [ ] Add troubleshooting guides
- [ ] Update contributing guidelines

**Acceptance Criteria:**
- README accurately reflects current project state
- Setup instructions work for new developers
- All outdated documentation is removed
- New features are properly documented
- Contributing process is clear

**Migration Reference:**
- From: `development-broken` branch documentation updates
- Files: README.md updates and massive doc cleanup
- Maintenance task for project clarity

---

## Summary

**Total Issues:** 14 subtasks  
**Total Estimated Value:** 937.5 USD  
**Total Estimated Time:** ~7.5 hours  

**Priority Breakdown:**
- Priority: 4 (Urgent): 1 issue
- Priority: 3 (High): 2 issues  
- Priority: 2 (Medium): 3 issues
- Priority: 1 (Normal): 4 issues
- Priority: 0 (Regression): 4 issues

**Phase Breakdown:**
- Phase 1 (Infrastructure): 3 issues
- Phase 2 (Core Functionality): 4 issues  
- Phase 3 (Technical Improvements): 3 issues
- Phase 4 (Quality & Polish): 4 issues

The migration plan follows a logical progression from infrastructure setup through core functionality implementation to final polish and optimization.