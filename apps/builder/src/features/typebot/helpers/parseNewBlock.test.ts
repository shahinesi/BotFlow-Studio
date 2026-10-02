import { expect, it } from "bun:test";
import { parseNewBlock } from "./parseNewBlock";

it("keeps Host capability identity separate from presentation when creating a block", () => {
  const block = parseNewBlock("host-user-access-check", {
    action: "hostCapability",
    capabilityKey: "identity.userAccessCheck",
    accessKey: "cashier-report-read",
    outputVariableId: "accessOutcome",
  });

  expect(block).toMatchObject({
    type: "host-user-access-check",
    options: {
      action: "hostCapability",
      capabilityKey: "identity.userAccessCheck",
      accessKey: "cashier-report-read",
      outputVariableId: "accessOutcome",
    },
  });
  expect(JSON.stringify(block)).not.toContain("بررسی دسترسی کاربر");
});
