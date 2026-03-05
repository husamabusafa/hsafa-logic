// =============================================================================
// Next.js Instrumentation — runs once on server start
//
// Bootstraps the extension module: self-registers with Core,
// discovers existing haseef connections, starts stream bridges.
// =============================================================================

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrapExtension } = await import("./lib/extension");
    await bootstrapExtension();
  }
}
