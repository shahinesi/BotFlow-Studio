# Upstream sync and Host integration

Status: the integration branch contains a private Host bridge, request-scoped execution context, generic Forge Host Action and prior local published-flow/session proof. The genericized published-flow/session regression is retained but its opt-in disposable DB test was not rerun in this pass. The branch's upstream base remains `3f287012`; `main` remains upstream-tracking. Production Host routing is not implemented.

The fork is `https://github.com/shahinesi/BotFlow-Studio.git`; upstream is `https://github.com/baptisteArno/typebot.io.git`. On 2026-09-28, both `main` HEADs resolved to `3f2870121bf5aa6e8d189cedacfa8c0d20d6774f`: **0 ahead / 0 behind** at that instant. Reusable Host integration work lives on `integration/shahrfarsh-botflow-phase1`, leaving `main` upstream-tracking. Do not rewrite either history.

## Sync procedure

1. Fetch `origin` and `upstream` and record their exact SHAs and merge base. Use `git rev-list --left-right --count upstream/main...origin/main` and inspect the changed paths before selecting a new base. Do not assume this snapshot remains current.
2. Fast-forward upstream-tracking `main` when possible. Keep Host integration work on an integration branch; rebase that branch onto the reviewed upstream `main` only when its collaborators and branch policy permit it. Otherwise merge without rewriting shared history.
3. Review conflicts in `packages/forge/repository`, `packages/bot-engine`, chat API, viewer routes, auth, Prisma and deployment files as security-sensitive. Never auto-resolve by taking all custom or all upstream code. Re-run affected Nx/Bun typecheck, tests, format/lint and required builds before proposing a merge.
4. Preserve upstream `LICENSE` and copyright notices. Check the applicable source license and Product/Legal gate for any external/commercial exposure.

## Custom change policy

Use the generic `@typebot.io/host-action-block` package and private `/api/internal/host/*` bridge for Host actions. Forge repository maps (`definitions.ts`, `handlers.ts`, `schemas.ts`) are generated; use the repository Forge CLI and inspect its output. Keep Host context request-scoped and out of Flow JSON, variables and `ChatSession.state`. A Host owns its users, permissions, transports and business Actions; this fork owns graph, published snapshot and Flow Session. See [Host Platform Integration](docs/integrations/host-platform/README.md).

For patch review, compare the integration branch with the exact upstream base, list custom paths separately, inspect source and tests for every core seam, then document any upstream security advisories or migration requirements. Push and merge follow each repository's branch policy and are separate from local commits.
