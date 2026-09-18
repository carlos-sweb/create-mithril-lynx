// src/main-thread.ts
//
// No app code here — mithril-lynx has exactly one rendering mode: all
// view logic runs in background.ts, this just starts the main-thread
// patch-replay runtime.

import { setupRenderer } from "mithril-lynx/main-thread";

setupRenderer();
