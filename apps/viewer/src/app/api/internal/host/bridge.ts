import {
  continueChatInputSchema,
  handleContinueChat,
} from "@typebot.io/bot-engine/api/handleContinueChat";
import {
  handleStartChat,
  startChatInputSchema,
} from "@typebot.io/bot-engine/api/handleStartChat";
import { getSession } from "@typebot.io/chat-session/queries/getSession";
import prisma from "@typebot.io/prisma";
import { runWithHostExecutionContext } from "@typebot.io/runtime-session-store/hostExecutionContext";
import { z } from "zod";
import { equal, sessionBinding, verifyHostRequest } from "./trustedContext";

const requestSchema = z
  .object({
    flowId: z.string().min(1),
    message: z.unknown().optional(),
  })
  .strict();

const failure = () =>
  Response.json({ error: "Host bridge request rejected" }, { status: 401 });

export const startHostChat = async (request: Request): Promise<Response> => {
  try {
    const trusted = verifyHostRequest(request);
    const body = requestSchema.parse(await request.json());
    if (body.flowId !== trusted.envelope.flowId) return failure();
    const input = startChatInputSchema.parse({
      publicId: body.flowId,
      message: body.message,
      textBubbleContentFormat: "markdown",
    });
    const result = await runWithHostExecutionContext(trusted, () =>
      handleStartChat({ input, context: {} }),
    );
    return Response.json({
      ...result,
      sessionBinding: sessionBinding(result.sessionId, trusted.envelope),
    });
  } catch {
    return failure();
  }
};

export const continueHostChat = async (
  request: Request,
  sessionId: string,
): Promise<Response> => {
  try {
    const trusted = verifyHostRequest(request);
    const body = requestSchema.parse(await request.json());
    if (body.flowId !== trusted.envelope.flowId) return failure();
    if (
      !equal(
        request.headers.get("x-host-session-binding"),
        sessionBinding(sessionId, trusted.envelope),
      )
    )
      return failure();
    const [session, publishedFlow] = await Promise.all([
      getSession(sessionId),
      prisma.publicTypebot.findFirst({
        where: { typebot: { publicId: body.flowId } },
        select: { id: true, typebotId: true },
      }),
    ]);
    if (
      !session?.state ||
      !publishedFlow ||
      session.state.publicTypebotId !== publishedFlow.id ||
      session.state.typebotsQueue[0]?.typebot.id !== publishedFlow.typebotId
    )
      return failure();
    const input = continueChatInputSchema.parse({
      sessionId,
      message: body.message,
      textBubbleContentFormat: "markdown",
    });
    const result = await runWithHostExecutionContext(trusted, () =>
      handleContinueChat({ input, context: {} }),
    );
    return Response.json(result);
  } catch {
    return failure();
  }
};
