window.__ModuleLoader__.load({
  id: "provider-balance",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var __create = Object.create;
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __getProtoOf = Object.getPrototypeOf;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name2 in all)
        __defProp(target, name2, { get: all[name2], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
      // If the importer is in node compatibility mode or this is not an ESM
      // file that has been converted to a CommonJS file using a Babel-
      // compatible transform (i.e. "__esModule" has not been set), then set
      // "default" to the CommonJS "module.exports" for node compatibility.
      isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
      mod
    ));
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
    
    // src/client.js
    var client_exports = {};
    __export(client_exports, {
      apply: () => apply,
      inject: () => inject,
      name: () => name
    });
    module.exports = __toCommonJS(client_exports);
    var React = __toESM(require("react"), 1);
    var name = "provider-balance-client";
    var inject = ["timer", "slots"];
    var ROUTE = "/provider-balance/balance";
    function useBalancePrefs(scope) {
      const [prefs, setPrefs] = React.useState({ enabled: true, interval: 60 });
      React.useEffect(() => {
        if (!scope) return void 0;
        const read = () => {
          const snap = scope.getSnapshot();
          if (snap.status === "ready" && snap.value) {
            setPrefs({
              enabled: snap.value.enabled !== false,
              interval: Number(snap.value.interval) || 60
            });
          }
        };
        read();
        return scope.subscribe(read);
      }, [scope]);
      return prefs;
    }
    function useCurrentProvider(useSessions, ctx) {
      const [current, setCurrent] = React.useState(null);
      React.useEffect(() => {
        if (!useSessions) return void 0;
        const list = useSessions((s) => s);
        const sessionId = list?.current;
        if (!sessionId) return;
        let cancelled = false;
        const connection = ctx.get("connection");
        const sessionsFace = connection?.api?.sessions;
        if (!sessionsFace?.models) return;
        sessionsFace.models({ sessionId }).then(({ result }) => {
          if (cancelled || !result?.ok) return;
          const { current: sel, groups } = result.value;
          if (!sel?.provider) return;
          const group = groups?.find((g) => g.id === sel.provider);
          setCurrent({
            provider: sel.provider,
            model: sel.model,
            label: group?.name ?? sel.provider
          });
        }).catch(() => {
        });
        return () => {
          cancelled = true;
        };
      }, [useSessions, ctx]);
      return current;
    }
    function useBalances(scope, ctx) {
      const prefs = useBalancePrefs(scope);
      const [state, setState] = React.useState({
        providers: null,
        error: null,
        loading: false
      });
      const load = React.useCallback((force) => {
        setState((s) => ({ ...s, loading: true }));
        fetch(`${ROUTE}${force ? "?refresh=1" : ""}`).then((r) => r.json()).then((data) => {
          if (data && Array.isArray(data.providers)) {
            setState({ providers: data.providers, error: null, loading: false });
          } else {
            setState((s) => ({ ...s, error: data && data.error || "unknown", loading: false }));
          }
        }).catch((e) => setState((s) => ({ ...s, error: String(e && e.message || e), loading: false })));
      }, []);
      React.useEffect(() => {
        if (prefs.enabled) load(false);
      }, [prefs.enabled, load]);
      React.useEffect(() => {
        if (!prefs.enabled) return void 0;
        return ctx.interval(() => load(false), Math.max(15, prefs.interval) * 1e3);
      }, [prefs.enabled, prefs.interval, load, ctx]);
      return { state, prefs, refresh: () => load(true) };
    }
    function BalanceBadge({ scope, ctx, useSessions }) {
      const { state, prefs, refresh } = useBalances(scope, ctx);
      const current = useCurrentProvider(useSessions, ctx);
      const [open, setOpen] = React.useState(false);
      if (!prefs.enabled) return null;
      const providers = state.providers ?? [];
      const active = providers.find((p) => p.provider === current?.provider) || providers.find((p) => p.ok) || providers[0];
      const label = active ? `${active.label} ${active.ok ? `${active.currency} ${active.balance.toFixed(2)}` : active.error}` : state.loading ? "\u4F59\u989D\u2026" : state.error ? "\u4F59\u989D ?" : "--";
      const highlightId = current?.provider;
      const rows = (providers.length ? providers : [{ label: "\u2014", error: state.error || "\u52A0\u8F7D\u4E2D" }]).map(
        (p) => React.createElement(
          "div",
          {
            key: p.provider ?? p.label,
            style: {
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              padding: "4px 0",
              fontSize: 13,
              opacity: highlightId === p.provider ? 1 : 0.85,
              fontWeight: highlightId === p.provider ? 600 : 400
            }
          },
          React.createElement("span", null, p.label + (highlightId === p.provider ? " \u25C2" : "")),
          React.createElement(
            "span",
            { style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: p.ok ? void 0 : "#e0a45c" } },
            p.ok ? `${p.currency} ${p.balance.toFixed(2)}` : p.error
          )
        )
      );
      return React.createElement(
        "div",
        { style: { position: "fixed", right: 16, bottom: 16, zIndex: 1e3, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, pointerEvents: "none" } },
        open && React.createElement(
          "div",
          {
            style: {
              pointerEvents: "auto",
              background: "rgba(20, 22, 28, 0.96)",
              color: "#e8e8e8",
              borderRadius: 10,
              padding: "10px 14px",
              minWidth: 200,
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.08)"
            }
          },
          React.createElement(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
            React.createElement("strong", { style: { fontSize: 13 } }, "\u4F9B\u5E94\u5546\u4F59\u989D"),
            React.createElement(
              "button",
              {
                onClick: () => setOpen(false),
                style: { background: "transparent", border: "none", color: "#888", cursor: "pointer", fontSize: 13, padding: 0 }
              },
              "\u2715"
            )
          ),
          rows,
          React.createElement(
            "div",
            { style: { marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" } },
            React.createElement(
              "button",
              { onClick: () => refresh(), style: { background: "transparent", border: "none", color: "#6ab0f3", cursor: "pointer", fontSize: 12, padding: 0 } },
              state.loading ? "\u5237\u65B0\u4E2D\u2026" : "\u27F3 \u5237\u65B0"
            ),
            state.error && React.createElement("span", { style: { fontSize: 11, color: "#e0a45c" } }, state.error)
          )
        ),
        React.createElement(
          "div",
          {
            onClick: () => setOpen((v) => !v),
            title: "\u70B9\u51FB\u5C55\u5F00/\u6536\u8D77\u5168\u90E8\u4F9B\u5E94\u5546\u4F59\u989D",
            style: {
              pointerEvents: "auto",
              cursor: "pointer",
              userSelect: "none",
              background: "rgba(20, 22, 28, 0.92)",
              color: "#e8e8e8",
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 13,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              gap: 6
            }
          },
          React.createElement("span", null, "\u{1F4B0}"),
          React.createElement("span", null, label),
          state.loading && React.createElement("span", { style: { opacity: 0.6 } }, "\u21BB")
        )
      );
    }
    function BalanceToggle({ scope }) {
      const prefs = useBalancePrefs(scope);
      const toggle = () => {
        if (scope) scope.set("enabled", !prefs.enabled);
      };
      return React.createElement(
        "button",
        {
          onClick: toggle,
          title: prefs.enabled ? "\u5173\u95ED\u4F59\u989D\u60AC\u6D6E\u7403" : "\u5F00\u542F\u4F59\u989D\u60AC\u6D6E\u7403",
          style: {
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            color: "inherit",
            padding: "4px 8px",
            borderRadius: 6
          }
        },
        prefs.enabled ? "\u{1F4B0} \u4F59\u989D \u5F00" : "\u{1F4B0} \u4F59\u989D \u5173"
      );
    }
    function BalanceSettingsSection({ scope }) {
      const prefs = useBalancePrefs(scope);
      const set = (field, value) => {
        if (scope) scope.set(field, value);
      };
      return React.createElement(
        "section",
        { style: { padding: "0 4px" } },
        React.createElement("h3", { style: { margin: "0 0 12px", fontSize: 15 } }, "\u4F9B\u5E94\u5546\u4F59\u989D"),
        React.createElement(
          "p",
          { style: { fontSize: 12, opacity: 0.75, margin: "0 0 12px" } },
          "\u60AC\u6D6E\u7403\u663E\u793A\u5F53\u524D\u5BF9\u8BDD\u680F\u9009\u4E2D\u7684\u4F9B\u5E94\u5546\u4F59\u989D\uFF1B\u70B9\u51FB\u5C55\u5F00\u5168\u90E8\u4F9B\u5E94\u5546\uFF08\u65E0\u4F59\u989D API \u7684\u663E\u793A n/a\uFF09\u3002\u4F9B\u5E94\u5546\u5217\u8868\u81EA\u52A8\u8DDF\u968F Settings > Model\u3002"
        ),
        React.createElement(
          "label",
          { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 14 } },
          React.createElement("input", {
            type: "checkbox",
            checked: prefs.enabled,
            onChange: (e) => set("enabled", e.target.checked)
          }),
          React.createElement("span", null, "\u663E\u793A\u4F59\u989D\u60AC\u6D6E\u7403")
        ),
        React.createElement(
          "label",
          { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 14 } },
          React.createElement("span", null, "\u5237\u65B0\u95F4\u9694\uFF08\u79D2\uFF09\uFF1A"),
          React.createElement("input", {
            type: "number",
            min: 15,
            max: 3600,
            value: prefs.interval,
            style: { width: 80 },
            onChange: (e) => set("interval", Math.max(15, Number(e.target.value) || 60))
          })
        ),
        !scope && React.createElement(
          "p",
          { style: { fontSize: 12, opacity: 0.7 } },
          "\u8BBE\u7F6E\u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u5F00\u5173\u4E0D\u4F1A\u88AB\u6301\u4E45\u5316\u3002"
        )
      );
    }
    function apply(ctx) {
      const settingsScope = ctx.get("settingsScope");
      const scope = settingsScope ? settingsScope.bind({ namespace: "provider-balance" }) : void 0;
      ctx.slots.inject("shell.overlay", () => ctx.slots.register(
        { name: "shell.overlay", id: "provider-balance.badge" },
        (props) => React.createElement(BalanceBadge, { scope, ctx, ...props })
      ));
      ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register(
        { name: "sidebar.footer.action", id: "provider-balance.toggle" },
        () => React.createElement(BalanceToggle, { scope })
      ));
      ctx.slots.inject("settings.section", () => ctx.slots.register(
        { name: "settings.section", id: "provider-balance", order: 200, label: () => "\u4F9B\u5E94\u5546\u4F59\u989D" },
        (props) => React.createElement(BalanceSettingsSection, { scope, ...props })
      ));
    }
    
    return module.exports;
  }
});
