import type { Instrumentation } from "next";

// Next calls this for every error thrown while rendering a page or running a route handler.
// The workbench runs offline, so errors go to the server's JSON log, not to a hosted tracker.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log, logRequestError } = await import("./lib/log");
  logRequestError(log, err, request, context);
};
