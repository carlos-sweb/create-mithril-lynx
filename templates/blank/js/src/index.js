import m from "mithril";

const App = {
  view() {
    return m("view", { class: "Page" }, [
      m("text", { class: "Title" }, "Hello, mithril-lynx!"),
    ]);
  },
};

export default { App, root: m(App) };
