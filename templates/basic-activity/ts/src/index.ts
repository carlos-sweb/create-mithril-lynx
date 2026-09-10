import m from "mithril";
import { createNavigator, type Nav } from "mithril-lynx/navigation";

interface DetailsAttrs {
  nav: Nav;
  message: string;
}

// A reusable app bar: a title, plus a back affordance when `onBack` is
// given. No m.route involved anywhere in this file — see
// mithril-lynx/navigation's own docs for why (Lynx pages have no URL to
// route to). Navigation here is a plain in-memory stack.
function AppBar(title: string, onBack?: () => void) {
  return m("view", { class: "AppBar" }, [
    onBack != null ? m("text", { class: "AppBar-back", ontap: onBack }, "←") : null,
    m("text", { class: "AppBar-title" }, title),
  ]);
}

const MainScreen: m.Component<{ nav: Nav }> = {
  view(vnode) {
    return m("view", { class: "Page" }, [
      AppBar("Basic Activity"),
      m("view", { class: "Content" }, [
        m("text", { class: "Description" }, "This is the main screen."),
        m("view", {
          class: "Button",
          ontap: () => vnode.attrs.nav.push(DetailsScreen, { message: "Hello from MainScreen!" }),
        }, [m("text", { class: "Button-label" }, "Next")]),
      ]),
    ]);
  },
};

const DetailsScreen: m.Component<DetailsAttrs> = {
  view(vnode) {
    return m("view", { class: "Page" }, [
      AppBar("Details", () => vnode.attrs.nav.pop()),
      m("view", { class: "Content" }, [
        m("text", { class: "Description" }, vnode.attrs.message),
      ]),
    ]);
  },
};

const nav = createNavigator({ initial: MainScreen });

export default { root: m(nav.Navigator) };
