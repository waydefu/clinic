// Build-time only; no extra client module or framework.
await import("./build-preserved-art.mjs");
await import("./build-assets.mjs");
await import("./build-inner-assets.mjs");
await import("./build-client.mjs");
await import("./build-pages.mjs");
await import("./record-sources.mjs");
await import("./record-whole-layout.mjs");
await import("./record-round2.mjs");
