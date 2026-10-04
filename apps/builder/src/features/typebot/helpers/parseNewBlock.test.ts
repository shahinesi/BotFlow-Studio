import { expect, it } from "bun:test";
import { parseNewBlock } from "./parseNewBlock";

it("keeps Host capability identity separate from presentation when creating a block", () => {
  const block = parseNewBlock("host-capability-check", {
    action: "hostCapabilityCheck",
    hostActionKey: "demo.capabilities",
    capabilityKey: "reports.read",
    outputVariableId: "capabilityResult",
  });

  expect(block).toMatchObject({
    type: "host-capability-check",
    options: {
      action: "hostCapabilityCheck",
      hostActionKey: "demo.capabilities",
      capabilityKey: "reports.read",
      outputVariableId: "capabilityResult",
    },
  });
  expect(JSON.stringify(block)).not.toContain("User access check");
});
