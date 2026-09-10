import shim from "mithril-lynx";
import m from "mithril";

import lynxLogo from "./assets/lynx-logo.png";
import mithrilLogo from "./assets/mithril-logo.png";
import arrow from "./assets/arrow.png";

let alterLogo = false;

const App: m.Component = {
  view() {
    return [
      m("view", { class: "Background" }),
      m("view", { class: "App" }, [
        m("view", { class: "Banner" }, [
          m("view", {
            class: "Logo",
            // shim.redraw() — NOT mithril's own m.redraw(), which is a
            // no-op in this shim-based architecture.
            ontap: () => {
              alterLogo = !alterLogo;
              shim.redraw();
            },
          }, [
            alterLogo
              ? m("image", { src: mithrilLogo, class: "Logo--mithril" })
              : m("image", { src: lynxLogo, class: "Logo--lynx" }),
          ]),
          m("text", { class: "Title" }, "Mithril"),
          m("text", { class: "Subtitle" }, "on Lynx"),
        ]),
        m("view", { class: "Content" }, [
          m("image", { src: arrow, class: "Arrow" }),
          m("text", { class: "Description" }, "Tap the logo and have fun!"),
          m("text", { class: "Hint" }, [
            "Edit ",
            m("text", { style: { fontStyle: "italic", color: "rgba(255, 255, 255, 0.85)" } }, "src/index.ts"),
            " to see updates!",
          ]),
        ]),
        m("view", { style: { flex: 1 } }),
      ]),
    ];
  },
};

export default { App, root: m(App) };
