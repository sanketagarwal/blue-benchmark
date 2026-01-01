# Monorepo Restructure: Separate Benchmarks from Apps

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize the monorepo to separate benchmark experiments (`/benchmarks/`) from deployable applications (`/apps/`), with subfolder organization in each.

**Architecture:** Move all current agent_XXX packages to `/benchmarks/` organized by domain. Keep `/apps/` empty and ready for production applications. Preserve all QA rules, coverage requirements, and lint configurations.

**Tech Stack:** Turbo, pnpm workspaces, Vitest, ESLint, TypeScript

---

## Current State

```
nullagent/
├── apps/
│   ├── agent_000/    # Twenty Questions game
│   ├── agent_001/    # Crossword (player variant)
│   ├── agent_002/    # Crossword (player variant 2)
│   ├── agent_003/    # Price forecaster
│   ├── agent_004/    # Matrix evaluation tool
│   ├── agent_005/    # Market maker benchmark
│   └── agent_006/    # Bottom caller benchmark
├── packages/
│   ├── agent-core/
│   ├── cli-utils/
│   ├── database/
│   ├── eslint-config/
│   ├── scorers/
│   └── typescript-config/
├── pnpm-workspace.yaml
├── turbo.json
├── vitest.config.ts
└── vitest.workspace.ts
```

## Target State

```
nullagent/
├── apps/                          # Production applications (empty initially)
│   └── .gitkeep
├── benchmarks/                    # Benchmark experiments
│   ├── games/
│   │   ├── twenty-questions/      # agent_000
│   │   ├── crossword-v1/          # agent_001
│   │   └── crossword-v2/          # agent_002
│   ├── forecasting/
│   │   ├── price-predictor/       # agent_003
│   │   └── matrix-eval/           # agent_004
│   └── trading/
│       ├── market-maker/          # agent_005
│       └── bottom-caller/         # agent_006
├── packages/                      # Shared packages (unchanged)
│   └── ...
├── pnpm-workspace.yaml            # Updated globs
├── turbo.json                     # No changes needed
├── vitest.config.ts               # Updated paths
└── vitest.workspace.ts            # Updated paths
```

---

## Package Name Mapping

| Current | New Location | New Package Name |
|---------|--------------|------------------|
| `agent_000` | `benchmarks/games/twenty-questions` | `@nullagent/bench-twenty-questions` |
| `agent_001` | `benchmarks/games/crossword-v1` | `@nullagent/bench-crossword-v1` |
| `agent_002` | `benchmarks/games/crossword-v2` | `@nullagent/bench-crossword-v2` |
| `agent_003` | `benchmarks/forecasting/price-predictor` | `@nullagent/bench-price-predictor` |
| `agent_004` | `benchmarks/forecasting/matrix-eval` | `@nullagent/bench-matrix-eval` |
| `agent_005` | `benchmarks/trading/market-maker` | `@nullagent/bench-market-maker` |
| `agent_006` | `benchmarks/trading/bottom-caller` | `@nullagent/bench-bottom-caller` |

---

## Pre-Migration Checklist

- [ ] Ensure all tests pass: `pnpm test`
- [ ] Ensure build passes: `pnpm build`
- [ ] Ensure no uncommitted changes: `git status`
- [ ] Create a backup branch: `git checkout -b backup/pre-restructure`
- [ ] Return to main: `git checkout main`

---

## Task 1: Create Directory Structure

**Files:**
- Create: `benchmarks/games/.gitkeep`
- Create: `benchmarks/forecasting/.gitkeep`
- Create: `benchmarks/trading/.gitkeep`

**Step 1: Create benchmark directories**

```bash
mkdir -p benchmarks/games benchmarks/forecasting benchmarks/trading
touch benchmarks/games/.gitkeep benchmarks/forecasting/.gitkeep benchmarks/trading/.gitkeep
```

**Step 2: Verify structure exists**

```bash
ls -la benchmarks/
```

Expected: Three subdirectories (games, forecasting, trading)

---

## Task 2: Update pnpm-workspace.yaml

**Files:**
- Modify: `pnpm-workspace.yaml`

**Step 1: Update workspace configuration**

Change from:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

To:
```yaml
packages:
  - "apps/*"
  - "apps/**/*"
  - "benchmarks/**/*"
  - "packages/*"
```

**Step 2: Verify syntax**

```bash
cat pnpm-workspace.yaml
```

---

## Task 3: Move Game Benchmarks

**Files:**
- Move: `apps/agent_000` → `benchmarks/games/twenty-questions`
- Move: `apps/agent_001` → `benchmarks/games/crossword-v1`
- Move: `apps/agent_002` → `benchmarks/games/crossword-v2`

**Step 1: Move directories**

```bash
mv apps/agent_000 benchmarks/games/twenty-questions
mv apps/agent_001 benchmarks/games/crossword-v1
mv apps/agent_002 benchmarks/games/crossword-v2
```

**Step 2: Update package.json names**

For each moved package, update `package.json`:

`benchmarks/games/twenty-questions/package.json`:
```json
{
  "name": "@nullagent/bench-twenty-questions",
  ...
}
```

`benchmarks/games/crossword-v1/package.json`:
```json
{
  "name": "@nullagent/bench-crossword-v1",
  ...
}
```

`benchmarks/games/crossword-v2/package.json`:
```json
{
  "name": "@nullagent/bench-crossword-v2",
  ...
}
```

**Step 3: Verify moves**

```bash
ls benchmarks/games/
```

Expected: `twenty-questions`, `crossword-v1`, `crossword-v2`

---

## Task 4: Move Forecasting Benchmarks

**Files:**
- Move: `apps/agent_003` → `benchmarks/forecasting/price-predictor`
- Move: `apps/agent_004` → `benchmarks/forecasting/matrix-eval`

**Step 1: Move directories**

```bash
mv apps/agent_003 benchmarks/forecasting/price-predictor
mv apps/agent_004 benchmarks/forecasting/matrix-eval
```

**Step 2: Update package.json names**

`benchmarks/forecasting/price-predictor/package.json`:
```json
{
  "name": "@nullagent/bench-price-predictor",
  ...
}
```

`benchmarks/forecasting/matrix-eval/package.json`:
```json
{
  "name": "@nullagent/bench-matrix-eval",
  ...
}
```

**Step 3: Verify moves**

```bash
ls benchmarks/forecasting/
```

Expected: `price-predictor`, `matrix-eval`

---

## Task 5: Move Trading Benchmarks

**Files:**
- Move: `apps/agent_005` → `benchmarks/trading/market-maker`
- Move: `apps/agent_006` → `benchmarks/trading/bottom-caller`

**Step 1: Move directories**

```bash
mv apps/agent_005 benchmarks/trading/market-maker
mv apps/agent_006 benchmarks/trading/bottom-caller
```

**Step 2: Update package.json names**

`benchmarks/trading/market-maker/package.json`:
```json
{
  "name": "@nullagent/bench-market-maker",
  ...
}
```

`benchmarks/trading/bottom-caller/package.json`:
```json
{
  "name": "@nullagent/bench-bottom-caller",
  ...
}
```

**Step 3: Verify moves**

```bash
ls benchmarks/trading/
```

Expected: `market-maker`, `bottom-caller`

---

## Task 6: Update Root vitest.config.ts

**Files:**
- Modify: `vitest.config.ts`

**Step 1: Update include patterns**

Change the `include` array from:
```typescript
include: [
  'packages/**/src/**/*.test.ts',
  'packages/**/src/**/*.test.tsx',
  'packages/**/__tests__/**/*.test.ts',
  'packages/**/__tests__/**/*.test.tsx',
  'apps/**/src/**/*.test.ts',
  'apps/**/src/**/*.test.tsx',
  'apps/**/__tests__/**/*.test.ts',
  'apps/**/__tests__/**/*.test.tsx',
],
```

To:
```typescript
include: [
  'packages/**/src/**/*.test.ts',
  'packages/**/src/**/*.test.tsx',
  'packages/**/__tests__/**/*.test.ts',
  'packages/**/__tests__/**/*.test.tsx',
  'apps/**/src/**/*.test.ts',
  'apps/**/src/**/*.test.tsx',
  'apps/**/__tests__/**/*.test.ts',
  'apps/**/__tests__/**/*.test.tsx',
  'benchmarks/**/src/**/*.test.ts',
  'benchmarks/**/src/**/*.test.tsx',
  'benchmarks/**/__tests__/**/*.test.ts',
  'benchmarks/**/__tests__/**/*.test.tsx',
],
```

**Step 2: Update exclude patterns in coverage.exclude**

Update all `apps/` specific paths to `benchmarks/` paths:

| Old Pattern | New Pattern |
|-------------|-------------|
| `apps/**/src/benchmark.ts` | `benchmarks/**/src/benchmark.ts` |
| `apps/agent_006/src/prefetch-warmup.ts` | `benchmarks/trading/bottom-caller/src/prefetch-warmup.ts` |
| `apps/agent_006/src/persist-results.ts` | `benchmarks/trading/bottom-caller/src/persist-results.ts` |
| `apps/agent_006/src/scorers/timing-metrics.ts` | `benchmarks/trading/bottom-caller/src/scorers/timing-metrics.ts` |
| `apps/agent_000/src/game-state.ts` | `benchmarks/games/twenty-questions/src/game-state.ts` |
| `apps/agent_004/src/**/*.ts` | `benchmarks/forecasting/matrix-eval/src/**/*.ts` |
| `apps/agent_005/src/matrix.ts` | `benchmarks/trading/market-maker/src/matrix.ts` |
| `apps/agent_005/src/results.ts` | `benchmarks/trading/market-maker/src/results.ts` |
| `apps/agent_005/src/table.ts` | `benchmarks/trading/market-maker/src/table.ts` |
| `apps/**/scripts/**` | `benchmarks/**/scripts/**` |
| `apps/**/src/app/api/**` | `benchmarks/**/src/app/api/**` |
| `apps/agent_005/src/market-maker.ts` | `benchmarks/trading/market-maker/src/market-maker.ts` |

**Step 3: Verify syntax**

```bash
pnpm exec tsc --noEmit vitest.config.ts
```

---

## Task 7: Update vitest.workspace.ts

**Files:**
- Modify: `vitest.workspace.ts`

**Step 1: Check current content and update if needed**

If it uses glob patterns, update to include benchmarks:

```typescript
export default [
  'packages/*',
  'apps/*',
  'benchmarks/**/*',
];
```

---

## Task 8: Update Git Hooks (if needed)

**Files:**
- Review: `.husky/pre-commit`
- Review: `.husky/pre-push`

**Step 1: Check pre-commit hook**

The pre-commit hook uses Turbo's automatic package discovery, which reads from `pnpm-workspace.yaml`. No changes needed if workspace yaml is correct.

**Step 2: Check markdown hygiene section**

Update the markdown location check in `.husky/pre-commit`:

Change:
```bash
if ! echo "$file" | grep -qE '^(docs/|README\.md|CONTRIBUTING\.md|CLAUDE\.md|AGENTS\.md|packages/[^/]+/README\.md|apps/[^/]+/README\.md)'; then
```

To:
```bash
if ! echo "$file" | grep -qE '^(docs/|README\.md|CONTRIBUTING\.md|CLAUDE\.md|AGENTS\.md|packages/[^/]+/README\.md|apps/.*/README\.md|benchmarks/.*/README\.md)'; then
```

---

## Task 9: Update Individual Package vitest.config.ts Files

**Files:**
- Modify: `benchmarks/trading/bottom-caller/vitest.config.ts`
- Modify: `benchmarks/trading/market-maker/vitest.config.ts`
- (other benchmark packages as needed)

**Step 1: Update coverage exclude paths in each package**

For `benchmarks/trading/bottom-caller/vitest.config.ts`, the exclude paths reference `**/src/` which should still work, but verify all patterns still match.

---

## Task 10: Reinstall Dependencies

**Step 1: Clean and reinstall**

```bash
rm -rf node_modules
rm -rf benchmarks/**/node_modules
rm -rf packages/**/node_modules
pnpm install
```

**Step 2: Verify installation**

```bash
pnpm ls --depth=0
```

---

## Task 11: Run Full QA Suite

**Step 1: Run lint**

```bash
pnpm lint
```

Expected: All packages pass

**Step 2: Run type-check**

```bash
pnpm check-types
```

Expected: All packages pass

**Step 3: Run tests with coverage**

```bash
pnpm test:coverage
```

Expected: All tests pass, coverage thresholds met

**Step 4: Run build**

```bash
pnpm build
```

Expected: All packages build successfully

---

## Task 12: Update CLAUDE.md References

**Files:**
- Modify: `CLAUDE.md` (if it references apps/agent_XXX paths)

**Step 1: Search and update any hardcoded paths**

```bash
grep -r "apps/agent_" CLAUDE.md docs/
```

Update any found references to new benchmark paths.

---

## Task 13: Clean Up apps/ Directory

**Files:**
- Keep: `apps/.gitkeep`
- Remove: Any leftover files

**Step 1: Ensure apps/ is empty except .gitkeep**

```bash
ls -la apps/
```

Expected: Only `.gitkeep`

**Step 2: If not empty, clean up**

```bash
rm -rf apps/agent_*
```

---

## Task 14: Commit and Push

**Step 1: Stage all changes**

```bash
git add -A
```

**Step 2: Commit with descriptive message**

```bash
git commit -m "$(cat <<'EOF'
refactor: reorganize monorepo structure

- Move benchmark apps from /apps to /benchmarks
- Organize benchmarks by domain: games, forecasting, trading
- Update workspace configuration for new structure
- Update vitest config paths for coverage
- Update git hooks for new paths
- Rename packages to @nullagent/bench-* convention

/benchmarks/ now contains all experimental benchmark code
/apps/ is ready for production applications
EOF
)"
```

**Step 3: Push**

```bash
git push
```

---

## Rollback Plan

If something goes wrong:

```bash
# Abort current changes
git checkout -- .
git clean -fd

# Or restore from backup branch
git checkout backup/pre-restructure
git checkout -b main-restored
```

---

## Post-Migration Verification

- [ ] `pnpm lint` passes
- [ ] `pnpm check-types` passes
- [ ] `pnpm test:coverage` passes with 90%+ coverage
- [ ] `pnpm build` passes
- [ ] `cd benchmarks/trading/bottom-caller && pnpm benchmark` works
- [ ] Git pre-commit hook passes
- [ ] Git pre-push hook passes
- [ ] All package imports resolve correctly

---

## Future Considerations

1. **Adding new benchmarks**: Create in appropriate `benchmarks/<domain>/` subfolder
2. **Adding production apps**: Create in `apps/<domain>/` with same structure
3. **Shared benchmark utilities**: Consider `packages/benchmark-utils` if patterns emerge
4. **CI/CD**: Update any CI workflows that reference `apps/agent_*` paths
