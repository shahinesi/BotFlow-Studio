# Upstream sync and Host integration

Status (2026-10-07): `main` is the canonical product branch for this fork. It contains current `upstream/main`, the Host Platform product integration, and accepted fixes #2615, #2616, and #2617. `integration/host-platform` is retained as a historical/reference branch and is no longer the deployment source. Production Host routing is not implemented.

The fork is `https://github.com/shahinesi/BotFlow-Studio.git`; upstream is `https://github.com/baptisteArno/typebot.io.git`. Older branch snapshots below this status are historical; always fetch and compare current refs before syncing.

## Branch model

- `origin/main`: canonical BotFlow product branch for our fork; deployable product source.
- `upstream/main`: upstream Typebot source. Keep the `upstream` remote and merge reviewed updates into `main`.
- `pr/*`: upstream contribution branches only. Keep contribution PRs open independently of equivalent changes already integrated into our fork.
- `integration/host-platform`: historical/non-canonical after promotion; do not use it as the deployment source.

## Sync procedure

1. Fetch `upstream` and `origin`; record their exact SHAs and merge base. Compare `upstream/main` with `origin/main`, then inspect upstream changed paths before merging.
2. On `main`, merge reviewed `upstream/main` with a normal merge commit. Preserve Host Platform customizations; do not rebase or force-push published product history.
3. Review conflicts in `packages/forge/repository`, `packages/bot-engine`, chat API, viewer routes, auth, Prisma and deployment files as security-sensitive. Never auto-resolve by taking all custom or all upstream code. Run affected Nx/Bun typecheck, tests, format/lint and required builds before pushing.
4. Deploy Stage from the exact reviewed `origin/main` SHA. Do not deploy from `integration/host-platform` or a dirty server checkout.
5. Preserve upstream `LICENSE` and copyright notices. Check the applicable source license and Product/Legal gate for any external/commercial exposure.

## Custom change policy

Use the generic `@typebot.io/host-action-block` package and private `/api/internal/host/*` bridge for Host actions. Forge repository maps (`definitions.ts`, `handlers.ts`, `schemas.ts`) are generated; use the repository Forge CLI and inspect its output. Keep Host context request-scoped and out of Flow JSON, variables and `ChatSession.state`. A Host owns its users, permissions, transports and business Actions; this fork owns graph, published snapshot and Flow Session. See [Host Platform Integration](docs/integrations/host-platform/README.md).

For patch review, compare the integration branch with the exact upstream base, list custom paths separately, inspect source and tests for every core seam, then document any upstream security advisories or migration requirements. Push and merge follow each repository's branch policy and are separate from local commits.
