import { expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";
import { getHostExecutionContext } from "@typebot.io/runtime-session-store/hostExecutionContext";
import { z } from "zod";

const seen: string[] = [];
mock.module("@typebot.io/bot-engine/api/handleStartChat", () => ({
  startChatInputSchema: z
    .object({ publicId: z.string(), message: z.unknown().optional() })
    .passthrough(),
  handleStartChat: async () => {
    seen.push(getHostExecutionContext().signedContext);
    return {
      sessionId: "session-a",
      messages: [{ type: "text", content: "before" }],
    };
  },
}));
mock.module("@typebot.io/bot-engine/api/handleContinueChat", () => ({
  continueChatInputSchema: z
    .object({ sessionId: z.string(), message: z.unknown().optional() })
    .passthrough(),
  handleContinueChat: async () => {
    seen.push(getHostExecutionContext().signedContext);
    return { messages: [{ type: "text", content: "after" }] };
  },
}));
mock.module("@typebot.io/chat-session/queries/getSession", () => ({
  getSession: async () => ({
    state: {
      publicTypebotId: "published-a",
      typebotsQueue: [{ typebot: { id: "typebot-a" } }],
    },
  }),
}));
mock.module("@typebot.io/prisma", () => ({
  default: {
    publicTypebot: {
      findFirst: async () => ({ id: "published-a", typebotId: "typebot-a" }),
    },
  },
}));

const { startHostChat, continueHostChat } = await import("./bridge");
const signingKey = "test-signing-key-with-at-least-32-bytes";
process.env.HOST_BRIDGE_SERVICE_KEY = "bridge-service-secret";
process.env.HOST_EXECUTION_CONTEXT_SIGNING_KEY = signingKey;
process.env.HOST_SESSION_BINDING_KEY =
  "test-binding-key-with-at-least-32-bytes";
const now = Math.floor(Date.now() / 1000);
const signed = (claims = { subject: "opaque-a" }) => {
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      iss: "example-host",
      aud: "botflow-host-action",
      flowId: "flow-a",
      executionId: "execution-a",
      iat: now,
      exp: now + 60,
      claims,
    }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", signingKey).update(payload).digest("base64url")}`;
};
const request = (binding?: string) =>
  new Request("http://localhost/api/internal/host/start", {
    method: "POST",
    headers: {
      "x-host-service-key": "bridge-service-secret",
      "x-host-execution-context": signed(),
      ...(binding ? { "x-host-session-binding": binding } : {}),
    },
    body: JSON.stringify({ flowId: "flow-a" }),
  });

it("starts and continues with request-only context and an opaque session binding", async () => {
  const token = signed();
  const startResponse = await startHostChat(request());
  expect(startResponse.status).toBe(200);
  const start = await startResponse.json();
  expect(start.messages[0].content).toBe("before");
  expect(typeof start.sessionBinding).toBe("string");
  expect(JSON.stringify(start)).not.toContain(token);
  expect(JSON.stringify(start)).not.toContain("opaque-a");
  const nextResponse = await continueHostChat(
    request(start.sessionBinding),
    "session-a",
  );
  expect(nextResponse.status).toBe(200);
  expect((await nextResponse.json()).messages[0].content).toBe("after");
  expect(seen).toEqual([token, token]);
  expect(() => getHostExecutionContext()).toThrow();
});

it("rejects continuation without a matching session binding and never logs credentials", async () => {
  const error = console.error;
  const logged: unknown[] = [];
  console.error = (...args) => {
    logged.push(...args);
  };
  try {
    expect((await continueHostChat(request(), "session-a")).status).toBe(401);
    expect((await continueHostChat(request("wrong"), "session-a")).status).toBe(
      401,
    );
    expect(logged).toEqual([]);
  } finally {
    console.error = error;
  }
});
