# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rule #1: Commit Before Claiming Completion

**No phase of work is complete until it is committed.** This is non-negotiable.

Before claiming any task, feature, or fix is done:

1. **`git add -A`** - Stage ALL changes in the repo
   - You are responsible for the entire repo state, not just your own edits
   - If a subagent broke something, you own that too
   - Unstaged changes = incomplete work

2. **`git commit`** - Commit must succeed (no `--no-verify`)
   - Pre-commit hooks ARE the quality gate
   - If hooks fail, your work is not done—fix it
   - A successful commit is proof your work meets standards

**Why this matters:** Only coding agents work in this repo. Every agent shares responsibility for repo quality. "I finished my part" is not acceptable—the commit passing is the only valid completion signal.

## Project Overview

NullAgent is a minimal LLM agent framework built on Turbo monorepo. It provides:
- **Durable workflows** via Vercel Workflow DevKit (`"use workflow"`, `"use step"`)
- **Message history with compaction** for LLM learning over time
- **Structured output** via AI SDK + Zod schemas
- **AI Gateway integration** for unified multi-provider LLM access

Apps define prompts (strings) and output schemas (Zod). The framework handles message persistence, compaction, and durable execution.

## Commands

```bash
# Development
pnpm dev                    # Start all packages in dev mode
pnpm build                  # Build all packages

# Quality Assurance
pnpm lint                   # Run ESLint across all packages
pnpm check-types            # TypeScript type checking
pnpm qa:quick               # Lint + type check (fast)
pnpm qa                     # Full QA: lint, types, db:check, test, build

# Testing
pnpm test:unit              # Run tests once
pnpm test:watch             # Run tests in watch mode
pnpm test:coverage          # Run tests with coverage report

# Database (requires DATABASE_URL)
pnpm db:generate            # Generate Drizzle migrations
pnpm db:migrate             # Apply migrations
pnpm db:push                # Push schema to database
pnpm db:studio              # Open Drizzle Studio
pnpm db:check               # Validate schema matches database

# Formatting
pnpm format                 # Format all files with Prettier
```

## Architecture

### Monorepo Structure
- `packages/agent-core/` - Core agent framework (defineAgent, runRound, message history, compaction)
- `packages/database/` - Drizzle ORM setup with postgres
- `packages/eslint-config/` - Shared ESLint configurations (base, nextjs, testing, library)
- `packages/typescript-config/` - Shared TypeScript configurations (base, nextjs, library, react-library)
- `apps/` - Agent applications (each ~30 lines: prompt + schema)

### ESLint Configuration Layers
1. **Base** (`@nullagent/eslint-config/base`) - Core TypeScript strict checking, import ordering, security rules, cognitive complexity ≤10
2. **Next.js** (`@nullagent/eslint-config/nextjs`) - Extends base with React/React Hooks/JSX-A11y/Next.js rules
3. **Testing** (`@nullagent/eslint-config/testing`) - Vitest and Testing Library rules with relaxed TypeScript strictness
4. **Library** (`@nullagent/eslint-config/library`) - Enhanced JSDoc requirements, explicit boundaries, named exports enforced

### TypeScript Configuration Layers
1. **base.json** - ES2022 target, maximum strict mode
2. **nextjs.json** - Extends base with DOM libs, JSX preserve, path aliases
3. **library.json** - Extends base with declaration maps
4. **react-library.json** - Extends library with DOM libs and react-jsx

## Code Quality Standards

- **All lint rules are errors** - No warnings; fix or explicitly disable with justification
- **90% test coverage required** - Lines, functions, branches, and statements
- **Cognitive complexity ≤10** - Functions must remain simple (SonarJS)
- **No fallbacks** - Errors propagate immediately; fail fast
- **kebab-case filenames** - Enforced by Unicorn
- **Named exports only** - Default exports only in index files and Next.js pages/layouts

## Git Hooks

Pre-commit and pre-push hooks enforce quality gates:
- ESLint and TypeScript checks on affected packages
- Tests run on affected packages
- Database schema validation (if DATABASE_URL set and db files changed)
- Blocks hardcoded secrets, console.log, and excessive `any` types
- Pre-push runs full QA with no cache (`TURBO_FORCE=true`)

## Disabling Lint Rules

When necessary, use inline comments with justification:
```typescript
// eslint-disable-next-line rule-name -- Justification for why this is necessary
```

For file-wide disables, prefer `eslint-disable-next-line` over `eslint-disable` for the entire file.
