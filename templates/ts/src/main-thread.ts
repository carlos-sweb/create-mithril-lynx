// src/main-thread.ts
//
// No app code here — v2 has exactly one rendering mode (plan §3.1): all
// view logic runs in background.ts, this just starts the main-thread
// patch-replay runtime.

import { setupRenderer } from "mithril-lynx-v2/main-thread";

setupRenderer();
