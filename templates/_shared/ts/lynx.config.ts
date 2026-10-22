import path from "node:path";
import { fileURLToPath } from "node:url";

import { pluginLynxConfig } from "@lynx-js/config-rsbuild-plugin";
import { pluginQRCode } from "@lynx-js/qrcode-rsbuild-plugin";
import { defineConfig } from "@lynx-js/rspeedy";
import { pluginTypeCheck } from "@rsbuild/plugin-type-check";

import { pluginMithrilLynx } from "mithril-lynx/plugin";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  source: {
    entry: {
      "main-thread": path.join(projectRoot, "src/main-thread.ts"),
    },
  },
  output: {
    distPath: {
      root: path.join(projectRoot, "dist"),
    },
    filename: "[name].bundle",
    // Keep large raster assets out of the JS bundle. Android assets can be
    // loaded by path, while only tiny images are worth inlining as data URIs.
    dataUriLimit: 4096,
  },
  plugins: [
    pluginMithrilLynx(),
    // enableNewGesture: the native gesture arena (mithril-lynx/gesture, once
    // it exists, needs this on — off by default, and __SetGestureDetector
    // calls are silently inert without it).
    // enableCSSRule: CSS selector rules beyond a single class/type match —
    // confirmed needed for a plain `:root { ... }` rule (used by every
    // template's style.css) to actually apply on a real device.
    pluginLynxConfig({ enableNewGesture: true, enableCSSRule: true }),
    pluginQRCode({
      schema(url) {
        // Opens the page in LynxExplorer in full screen mode.
        return `${url}?fullscreen=true`;
      },
    }),
    pluginTypeCheck(),
  ],
});
