# ShahrFarsh Host example

ShahrFarsh Web App implements the Host side of the generic contract. Its BotFlow adapter signs a generic envelope with issuer `shahrfarsh-web`, audience `botflow-host-action`, the published `flowId`, an `executionId`, timestamps and opaque `claims` containing `botUserId`, `connectionId` and `botAppId`.

The BI Action Gateway remains in ShahrFarsh. It verifies the BotFlow service credential and assertion, reloads the user, connection and app binding from BI storage, rechecks `BotCommandPolicy`, and dispatches only allowlisted actions through the existing registry. `system.whoami` is the current diagnostic action; BotFlow does not implement it.

The contract proof is recorded in ShahrFarsh's `BOTFLOW_PHASE_1A_TRUSTED_BRIDGE.md` and `BOTFLOW_PHASE_1B_PERSISTENT_SESSION.md`. The published Flow, real BotFlow `ChatSession`, process restart and continuation are test evidence; production Channel Runtime routing and BotApp provider binding remain planned.
