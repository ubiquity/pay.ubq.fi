# Issue #421 Concurrent Execution Manual

## Overview
This manual enables orchestrating multiple specialized agents to work on Issue #421 subtasks simultaneously using git worktrees for isolated development environments.

## Prerequisites
- All specialized agents copied to `~/.claude/agents/`
- Clean working directory in main branch
- Git worktrees support enabled

## Git Worktree Setup

### 1. Create Worktrees for Each Phase
```bash
# From main project directory (/Users/nv/repos/ubiquity/pay.ubq.fi)
git worktree add ../pay.ubq.fi-phase1 refactor/cleanup-2
git worktree add ../pay.ubq.fi-phase2 refactor/cleanup-2  
git worktree add ../pay.ubq.fi-phase3 refactor/cleanup-2
git worktree add ../pay.ubq.fi-phase4 refactor/cleanup-2

# Verify worktrees created
git worktree list
```

### 2. Create Branch for Each Phase
```bash
# Phase 1 - Infrastructure Setup
cd ../pay.ubq.fi-phase1
git checkout -b feature/phase1-infrastructure
cd -

# Phase 2 - Core Functionality  
cd ../pay.ubq.fi-phase2
git checkout -b feature/phase2-core-functionality
cd -

# Phase 3 - Technical Improvements
cd ../pay.ubq.fi-phase3  
git checkout -b feature/phase3-technical-improvements
cd -

# Phase 4 - Quality & Polish
cd ../pay.ubq.fi-phase4
git checkout -b feature/phase4-quality-polish
cd -
```

## Agent Orchestration

### Available Specialized Agents
- `infrastructure-setup` → `/Users/nv/repos/pay.ubq.fi-phase1`
- `core-functionality` → `/Users/nv/repos/pay.ubq.fi-phase2` 
- `technical-improvements` → `/Users/nv/repos/pay.ubq.fi-phase3`
- `quality-polish` → `/Users/nv/repos/pay.ubq.fi-phase4`

### Execution Commands

#### 1. Launch Infrastructure Setup Agent (Phase 1)
**Worktree:** `/Users/nv/repos/pay.ubq.fi-phase1`
**Branch:** `feature/phase1-infrastructure`
**Tasks:** #425, #426, #427

```bash
cd /Users/nv/repos/pay.ubq.fi-phase1
```

```
Task.use('infrastructure-setup', {
  description: 'Execute Phase 1 infrastructure tasks',
  prompt: 'Working in /Users/nv/repos/pay.ubq.fi-phase1 on branch feature/phase1-infrastructure. Execute all Phase 1 tasks: 

#425 - Set up shared src/ directory structure:
- Move backend/ → src/backend/
- Move frontend/ → src/frontend/
- Update all import paths and references
- Update GitHub Actions workflow paths
- Test both frontend/backend functionality

#426 - Configure root-level build tools:
- Add eslint.config.js at project root (52 lines)
- Add knip.jsonc for dead code detection (33 lines)
- Add tsconfig.json at project root (42 lines)  
- Move .prettierrc to root level
- Add .prettierignore at root (12 lines)

#427 - Update package.json and dependencies:
- Update root package.json with new dependencies
- Remove unused dependencies and submodules
- Move @types/node-fetch to devDependencies
- Remove git submodules: lib/forge-std, lib/permit2

Commit changes when phase complete. Report status.'
})
```

#### 2. Launch Core Functionality Agent (Phase 2)
**Worktree:** `/Users/nv/repos/pay.ubq.fi-phase2`
**Branch:** `feature/phase2-core-functionality` 
**Tasks:** #428, #429, #430, #431

```bash
cd /Users/nv/repos/pay.ubq.fi-phase2
```

```
Task.use('core-functionality', {
  description: 'Execute Phase 2 core functionality',
  prompt: 'Working in /Users/nv/repos/pay.ubq.fi-phase2 on branch feature/phase2-core-functionality. Execute all Phase 2 tasks in priority order:

PRIORITY: #428 - Implement Permit3 ABI integration (CRITICAL PATH):
- Add src/frontend/src/fixtures/permit3-abi.json (970 lines)
- Update use-permit-claiming.ts to use Permit3 ABI and addresses
- Update use-permit-invalidation.ts for Permit3 compatibility
- Update permit-checker.worker.ts validation logic
- Remove old Permit2 ABI files
- Test permit claiming with new contract

#429 - Implement permit invalidation functionality:
- Create src/frontend/src/hooks/use-permit-invalidation.ts (93 lines)
- Implement invalidation transaction logic
- Add UI components for invalidation actions
- Update permit row component with invalidation options

#430 - Implement GitHub username integration:
- Create src/frontend/src/hooks/use-github-usernames.ts (97 lines)
- Create src/frontend/src/utils/github-cache.ts (48 lines)
- Create src/frontend/src/utils/format-utils.ts (34 lines)
- Implement GitHub API with rate limiting and 30-day caching

#431 - Enhanced permit data management:
- Update src/frontend/src/hooks/use-permit-data.ts (296 lines)
- Implement beneficiary and owner permit retrieval
- Update batch claiming to use permitsToClaim
- Optimize database queries with left joins

Commit changes when phase complete. Report status.'
})
```

#### 3. Launch Technical Improvements Agent (Phase 3)  
**Worktree:** `/Users/nv/repos/pay.ubq.fi-phase3`
**Branch:** `feature/phase3-technical-improvements`
**Tasks:** #432, #433, #434

```bash
cd /Users/nv/repos/pay.ubq.fi-phase3
```

```
Task.use('technical-improvements', {
  description: 'Execute Phase 3 technical improvements',
  prompt: 'Working in /Users/nv/repos/pay.ubq.fi-phase3 on branch feature/phase3-technical-improvements. Execute all Phase 3 tasks:

#432 - Add Playwright MCP browser automation:
- Add docs/PLAYWRIGHT_SETUP.md documentation (149 lines)
- Create scripts/start-browser-cdp.sh setup script (210 lines)
- Configure Playwright MCP in project settings
- Add .playwright-mcp/ to .gitignore
- Set up CDP (Chrome DevTools Protocol) browser automation
- Test browser automation functionality

#433 - Update database types and improve type safety:
- Update src/frontend/src/database.types.ts with latest Supabase schema (767 lines)
- Add proper type imports to backend server.ts
- Update frontend type definitions
- Remove unused database tables and types
- Add helper types (Tables, TablesInsert, TablesUpdate, Enums)

#434 - Implement debug configuration system:
- Implement debug flag configuration system
- Add environment variable support for debug modes
- Create debug utilities and logging helpers
- Update components to use debug flags appropriately
- Add development vs production debug handling

Commit changes when phase complete. Report status.'
})
```

#### 4. Launch Quality & Polish Agent (Phase 4)
**Worktree:** `/Users/nv/repos/pay.ubq.fi-phase4`
**Branch:** `feature/phase4-quality-polish`
**Tasks:** #435, #436, #437, #438

```bash
cd /Users/nv/repos/pay.ubq.fi-phase4
```

```
Task.use('quality-polish', {
  description: 'Execute Phase 4 quality and polish',
  prompt: 'Working in /Users/nv/repos/pay.ubq.fi-phase4 on branch feature/phase4-quality-polish. Execute all Phase 4 tasks:

#435 - Fix visual rounding issues for rewards display:
- Locate all components displaying reward amounts (e.g. permit-row.tsx)
- Implement proper number formatting to avoid visual rounding errors
- Use appropriate libraries for big decimals if needed
- Test with various amount values, including decimals

#436 - Eliminate console warnings and improve error handling:
- Fix invalid permit validation in worker causing 300+ warnings
- Update error handling in permit-related components
- Improve error states and user feedback messages
- Remove any remaining console.log statements
- Add proper error boundaries where needed

#437 - Optimize performance and caching improvements:
- Update Vite configuration for better build optimization
- Enhance caching in github-cache.ts, extend duration
- Improve rate limiting for API calls
- Profile application and optimize slow components

#438 - Update documentation and cleanup:
- Update main README.md with current project structure (238 lines added)
- Remove outdated documentation files (15,000+ lines deleted)
- Create up-to-date setup and development guides
- Document new features and APIs

Commit changes when phase complete. Report status.'
})
```

## Orchestrator Command (Launch All Phases)

To start all phases concurrently:

```
Task.use('background-orchestrator', {
  description: 'Execute Issue #421 phases concurrently',
  prompt: 'Launch all specialized agents to work on Issue #421 concurrently using git worktrees:

AGENT ASSIGNMENTS:
- infrastructure-setup → /Users/nv/repos/pay.ubq.fi-phase1 (branch: feature/phase1-infrastructure)  
- core-functionality → /Users/nv/repos/pay.ubq.fi-phase2 (branch: feature/phase2-core-functionality)
- technical-improvements → /Users/nv/repos/pay.ubq.fi-phase3 (branch: feature/phase3-technical-improvements)
- quality-polish → /Users/nv/repos/pay.ubq.fi-phase4 (branch: feature/phase4-quality-polish)

EXECUTION PLAN:
1. Each agent works in their isolated worktree environment
2. Phase 2 (core-functionality) prioritizes #428 Permit3 ABI as critical path
3. All other phases can execute concurrently  
4. Each agent commits their changes when phase is complete
5. Report consolidated progress and status

COORDINATION:
- Monitor dependencies between phases
- Ensure no conflicts in file modifications
- Provide structured progress updates
- Handle any cross-phase integration requirements

Begin concurrent execution.'
})
```

## Post-Execution Integration

### 1. Review Phase Completion
```bash
# Check status of each worktree
git worktree list
cd ../pay.ubq.fi-phase1 && git status && cd -
cd ../pay.ubq.fi-phase2 && git status && cd -  
cd ../pay.ubq.fi-phase3 && git status && cd -
cd ../pay.ubq.fi-phase4 && git status && cd -
```

### 2. Merge Phases (Sequential Integration)
```bash
# Start with Phase 1 (infrastructure foundation)
git merge feature/phase1-infrastructure

# Then Phase 2 (core functionality)  
git merge feature/phase2-core-functionality

# Then Phase 3 (technical improvements)
git merge feature/phase3-technical-improvements

# Finally Phase 4 (quality & polish)
git merge feature/phase4-quality-polish
```

### 3. Clean Up Worktrees
```bash
git worktree remove ../pay.ubq.fi-phase1
git worktree remove ../pay.ubq.fi-phase2
git worktree remove ../pay.ubq.fi-phase3  
git worktree remove ../pay.ubq.fi-phase4
```

## Success Criteria

Each agent should report completion with:
- ✅ All assigned tasks completed
- ✅ Changes committed to respective branch
- ✅ No build/compilation errors
- ✅ Phase-specific success criteria met
- 📋 Summary of files modified and key changes

## Emergency Procedures

If an agent gets stuck or encounters blocking issues:
1. Check the specific worktree for git status and conflicts
2. Review agent-specific logs and error messages
3. Use the orchestrator to reassign or redistribute tasks
4. Merge completed phases independently if needed

## Dependencies Map

- **Phase 2** depends on **Phase 1** for directory structure
- **Phase 3** can run independently  
- **Phase 4** can run independently but may benefit from Phase 2 completion
- **Critical Path**: Phase 1 → Phase 2 (#428 Permit3) → Integration

Execute phases with awareness of these dependencies for optimal results.