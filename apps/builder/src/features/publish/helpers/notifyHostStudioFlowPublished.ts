export const notifyHostStudioFlowPublished = (input: {
  editableFlowId: string;
  publicFlowId: string;
}) => {
  if (typeof window === "undefined" || window.parent === window) return;

  let targetOrigin: string;
  try {
    targetOrigin = new URL(document.referrer).origin;
  } catch {
    return;
  }
  if (targetOrigin === "null") return;

  window.parent.postMessage(
    {
      version: 1,
      type: "hostStudio.flowPublished",
      ...input,
    },
    targetOrigin,
  );
};
