/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  RESEARCH CONTROL PANEL   (researcher-facing settings window)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Lets a researcher change every interface setting from an on-screen panel —
 *  no code editing. It reads and writes the single window.CONFIG object defined
 *  in config.js, saves choices to the browser (localStorage) via saveConfig(),
 *  and refreshes the page instantly (no reload) after every change.
 *
 *  It NEVER touches payoff/APR/interest math, the slider logic, the ?v=
 *  experimental version system, Qualtrics integration, or research data
 *  collection. It only flips the display settings those other files already read.
 *
 *  ───────────────────────────────────────────────────────────────────────────
 *  HOW A RESEARCHER OPENS IT (participants never do either of these):
 *      • Add  ?research=1  to the page URL, or
 *      • Press  Ctrl/Cmd + Shift + 0
 *  It stays hidden for normal study participants.
 *
 *  ───────────────────────────────────────────────────────────────────────────
 *  ADDING A NEW SETTING LATER (this is the whole job):
 *      1. Add one property to window.CONFIG in config.js  (+ have some file read it).
 *      2. Add one entry to the SCHEMA array below.
 *  No other code changes are required — rendering, saving, resetting and the
 *  live refresh are all generic.
 * ═══════════════════════════════════════════════════════════════════════════
 */
(function () {
  "use strict";

  /* ─────────────────────────────────────────────────────────────────────────
   * 1. CONTROL SCHEMA  (plain language, grouped like a settings window)
   *
   *   key    – the matching property name in window.CONFIG
   *   label  – what the researcher sees (never a variable name)
   *   help   – optional one-line hint under the control
   *   kind   – how the stored value is typed:
   *              "number"  stored as a Number
   *              "string"  stored as a String
   *              "tri"     stored as true / false / "auto"
   *              "bool"    stored as true / false
   *   type   – how it is drawn: "select" | "radio"
   *   options– [{ value, label }] for select / radio (value is always a string;
   *            it is coerced to `kind` on the way into CONFIG)
   * ───────────────────────────────────────────────────────────────────────── */
  var TRISTATE = [
    { value: "auto",  label: "Auto (follow mode)" },
    { value: "true",  label: "Show" },
    { value: "false", label: "Hide" }
  ];

  var SCHEMA = [
    {
      group: "Survey layout",
      controls: [
        {
          key: "activeLayout", label: "Layout (1–7)", kind: "number", type: "select",
          help: "The finalized survey condition. Also settable via ?layout=1…7 in the URL.",
          options: [
            { value: "1", label: "1 — Baseline control (options only)" },
            { value: "2", label: "2 — Options + total cost & payoff time" },
            { value: "3", label: "3 — Options + total, time, interest & principal" },
            { value: "4", label: "4 — Slider (total & payoff time message)" },
            { value: "5", label: "5 — Slider (interest & principal message)" },
            { value: "6", label: "6 — Slider + graph (total, payoff time)" },
            { value: "7", label: "7 — Slider + graph (principal, interest, total, time)" }
          ]
        }
      ]
    },
    {
      group: "Visualization",
      advanced: true,
      controls: [
        {
          key: "activeStrategy", label: "Chart type", kind: "number", type: "select",
          help: "Which visualization participants see.",
          options: [
            { value: "1", label: "1 — Payment progress over time" },
            { value: "2", label: "2 — Fixed timeline comparison" },
            { value: "3", label: "3 — Payment strategy comparison" },
            { value: "4", label: "4 — Lifetime cost comparison" },
            { value: "5", label: "5 — Interest vs. principal breakdown" },
            { value: "6", label: "6 — Cumulative payment progress" },
            { value: "7", label: "7 — Payment progress (zoomable)" },
            { value: "8", label: "8 — Lifetime cost & time comparison" },
            { value: "9", label: "9 — Lifetime total cost comparison" }
          ]
        }
      ]
    },
    {
      group: "Timeline controls",
      controls: [
        {
          key: "tabDisplayMode", label: "Timeline tabs", kind: "number", type: "radio",
          help: "Only affects the timeline chart types (1 and 7).",
          options: [
            { value: "0", label: "Hide timeline controls" },
            { value: "1", label: "Show current timeline only" },
            { value: "2", label: "Show all timeline tabs" }
          ]
        }
      ]
    },
    {
      group: "Information display",
      controls: [
        {
          key: "infoDensity", label: "Amount of explanation", kind: "string", type: "select",
          help: "Preset bundle of how much guidance text is shown.",
          options: [
            { value: "minimal",  label: "Minimal — looks like a real card site" },
            { value: "standard", label: "Standard — moderate guidance" },
            { value: "detailed", label: "Detailed — full explanations" }
          ]
        }
      ]
    },
    {
      group: "Individual components",
      advanced: true,
      controls: [
        { key: "showHero",                      label: "Instructional banner",      kind: "tri", type: "select", options: TRISTATE },
        { key: "showSummaryCards",              label: "Summary result cards",      kind: "tri", type: "select", options: TRISTATE },
        { key: "showVisualizationDescriptions", label: "Chart descriptions",        kind: "tri", type: "select", options: TRISTATE },
        { key: "showSliderDescription",         label: "Slider explanation",        kind: "tri", type: "select", options: TRISTATE },
        { key: "showDisclaimer",                label: "APR disclaimer text",       kind: "tri", type: "select", options: TRISTATE },
        { key: "showTooltips",                  label: "Chart hover tooltips",      kind: "tri", type: "select", options: TRISTATE }
      ]
    },
    {
      group: "Layout",
      advanced: true,
      controls: [
        {
          key: "compactLayout", label: "Spacing", kind: "tri", type: "select",
          options: [
            { value: "auto",  label: "Auto (responsive)" },
            { value: "true",  label: "Compact" },
            { value: "false", label: "Roomy" }
          ]
        },
        {
          key: "centerContentVertically", label: "Center short pages", kind: "bool", type: "select",
          options: [
            { value: "true",  label: "On" },
            { value: "false", label: "Off" }
          ]
        }
      ]
    }
  ];

  /* ─────────────────────────────────────────────────────────────────────────
   * 2. VALUE COERCION  (control string  ⇄  typed CONFIG value)
   * ───────────────────────────────────────────────────────────────────────── */
  function toConfigValue(kind, raw) {
    if (kind === "number") return Number(raw);
    if (kind === "bool")   return raw === "true" || raw === true;
    if (kind === "tri") {
      if (raw === "true"  || raw === true)  return true;
      if (raw === "false" || raw === false) return false;
      return "auto";
    }
    return String(raw); // "string"
  }

  function toControlValue(kind, val) {
    if (kind === "tri" || kind === "bool") {
      if (val === true)  return "true";
      if (val === false) return "false";
      return "auto";
    }
    return String(val);
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 3. LIVE REFRESH  (no page reload)
   *    applyInterfaceConfig() → density / visibility / tooltips (config.js)
   *    rerenderStudyVisualization() → redraw chart with current selection
   *                                   (script.js; it calls applyStrategyConfig)
   * ───────────────────────────────────────────────────────────────────────── */
  function refreshInterface() {
    if (typeof window.applyInterfaceConfig === "function") window.applyInterfaceConfig();
    if (typeof window.rerenderStudyVisualization === "function") window.rerenderStudyVisualization();
  }

  function persist() {
    if (typeof window.saveConfig === "function") window.saveConfig();
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 4. STYLES  (scoped, injected — participant CSS is left untouched)
   * ───────────────────────────────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById("rcp-styles")) return;
    var css =
      '#rcp-fab{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:48px;height:48px;border-radius:50%;' +
        'border:none;cursor:pointer;background:#1C3A2A;color:#F7F5F0;box-shadow:0 6px 20px rgba(0,0,0,.28);' +
        'font-size:20px;display:flex;align-items:center;justify-content:center;transition:transform .15s,background .15s;}' +
      '#rcp-fab:hover{background:#2E6B4F;transform:scale(1.06);}' +
      '#rcp-overlay{position:fixed;inset:0;z-index:2147483200;background:rgba(20,30,25,.35);opacity:0;pointer-events:none;transition:opacity .2s;}' +
      '#rcp-overlay.rcp-open{opacity:1;pointer-events:auto;}' +
      '#rcp-panel{position:fixed;top:0;right:0;height:100%;width:380px;max-width:92vw;z-index:2147483300;' +
        'background:#F7F5F0;box-shadow:-8px 0 28px rgba(0,0,0,.22);transform:translateX(105%);transition:transform .24s ease;' +
        'display:flex;flex-direction:column;font-family:"Libre Franklin",system-ui,-apple-system,sans-serif;color:#1C3A2A;}' +
      '#rcp-panel.rcp-open{transform:translateX(0);}' +
      '.rcp-head{background:#1C3A2A;color:#F7F5F0;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}' +
      '.rcp-head h2{margin:0;font-size:1.05rem;font-weight:700;letter-spacing:.01em;}' +
      '.rcp-head p{margin:2px 0 0;font-size:.72rem;opacity:.8;font-weight:500;}' +
      '.rcp-x{background:transparent;border:none;color:#F7F5F0;font-size:1.5rem;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px;}' +
      '.rcp-x:hover{background:rgba(255,255,255,.14);}' +
      '.rcp-body{padding:8px 20px 20px;overflow-y:auto;flex:1;}' +
      '.rcp-group{border-top:1px solid rgba(28,58,42,.12);padding:16px 0 4px;}' +
      '.rcp-group:first-child{border-top:none;}' +
      '.rcp-group-title{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#4A5C50;margin:0 0 12px;}' +
      '.rcp-field{margin-bottom:16px;}' +
      '.rcp-field > label.rcp-label{display:block;font-size:.86rem;font-weight:600;margin-bottom:6px;color:#1C3A2A;}' +
      '.rcp-help{font-size:.72rem;color:#6B6457;margin:6px 0 0;line-height:1.45;}' +
      '.rcp-select{width:100%;padding:9px 12px;font-size:.86rem;font-family:inherit;color:#1C3A2A;background:#fff;' +
        'border:1px solid rgba(28,58,42,.22);border-radius:8px;cursor:pointer;appearance:none;' +
        'background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%234A5C50\' stroke-width=\'3\'><path d=\'M6 9l6 6 6-6\'/></svg>");' +
        'background-repeat:no-repeat;background-position:right 12px center;padding-right:34px;}' +
      '.rcp-select:focus{outline:none;border-color:#2E6B4F;box-shadow:0 0 0 3px rgba(46,107,79,.15);}' +
      '.rcp-radios{display:flex;flex-direction:column;gap:8px;}' +
      '.rcp-radio{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(28,58,42,.16);' +
        'border-radius:8px;cursor:pointer;font-size:.85rem;background:#fff;transition:border-color .12s,background .12s;}' +
      '.rcp-radio:hover{border-color:#2E6B4F;background:rgba(46,107,79,.06);}' +
      '.rcp-radio input{accent-color:#2E6B4F;width:16px;height:16px;cursor:pointer;flex-shrink:0;}' +
      '.rcp-radio.rcp-checked{border-color:#2E6B4F;background:rgba(46,107,79,.1);font-weight:600;}' +
      '.rcp-adv-toggle{width:100%;text-align:left;background:transparent;border:none;cursor:pointer;padding:6px 0;' +
        'font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#4A5C50;display:flex;align-items:center;gap:6px;}' +
      '.rcp-adv-wrap{display:none;}' +
      '.rcp-adv-wrap.rcp-shown{display:block;}' +
      '.rcp-foot{border-top:1px solid rgba(28,58,42,.12);padding:14px 20px;display:flex;gap:10px;flex-shrink:0;background:#EDE9E1;}' +
      '.rcp-btn{flex:1;padding:10px 14px;font-size:.84rem;font-weight:600;font-family:inherit;border-radius:8px;cursor:pointer;border:1px solid transparent;transition:background .12s;}' +
      '.rcp-btn-reset{background:#fff;color:#9B3232;border-color:rgba(155,50,50,.35);}' +
      '.rcp-btn-reset:hover{background:rgba(155,50,50,.08);}' +
      '.rcp-btn-done{background:#2E6B4F;color:#F7F5F0;}' +
      '.rcp-btn-done:hover{background:#1C3A2A;}' +
      '.rcp-note{font-size:.7rem;color:#6B6457;padding:0 20px 14px;background:#EDE9E1;flex-shrink:0;line-height:1.5;}' +
      '@media (max-width:480px){#rcp-panel{width:100%;max-width:100%;}}';
    var style = document.createElement("style");
    style.id = "rcp-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 5. BUILD THE PANEL  (generic — driven entirely by SCHEMA)
   * ───────────────────────────────────────────────────────────────────────── */
  var els = {}; // key -> array of input elements, for syncing after Reset

  function buildControl(ctrl) {
    var field = document.createElement("div");
    field.className = "rcp-field";

    var current = toControlValue(ctrl.kind, window.CONFIG[ctrl.key]);
    els[ctrl.key] = [];

    if (ctrl.type === "radio") {
      var lbl = document.createElement("label");
      lbl.className = "rcp-label";
      lbl.textContent = ctrl.label;
      field.appendChild(lbl);

      var radios = document.createElement("div");
      radios.className = "rcp-radios";
      ctrl.options.forEach(function (opt) {
        var row = document.createElement("label");
        row.className = "rcp-radio" + (opt.value === current ? " rcp-checked" : "");
        var input = document.createElement("input");
        input.type = "radio";
        input.name = "rcp-" + ctrl.key;
        input.value = opt.value;
        input.checked = opt.value === current;
        input.addEventListener("change", function () {
          setConfig(ctrl, input.value);
          radios.querySelectorAll(".rcp-radio").forEach(function (r) { r.classList.remove("rcp-checked"); });
          row.classList.add("rcp-checked");
        });
        els[ctrl.key].push(input);
        var span = document.createElement("span");
        span.textContent = opt.label;
        row.appendChild(input);
        row.appendChild(span);
        radios.appendChild(row);
      });
      field.appendChild(radios);
    } else {
      // select
      var lbl2 = document.createElement("label");
      lbl2.className = "rcp-label";
      lbl2.setAttribute("for", "rcp-sel-" + ctrl.key);
      lbl2.textContent = ctrl.label;
      field.appendChild(lbl2);

      var sel = document.createElement("select");
      sel.className = "rcp-select";
      sel.id = "rcp-sel-" + ctrl.key;
      ctrl.options.forEach(function (opt) {
        var o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === current) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () { setConfig(ctrl, sel.value); });
      els[ctrl.key].push(sel);
      field.appendChild(sel);
    }

    if (ctrl.help) {
      var help = document.createElement("p");
      help.className = "rcp-help";
      help.textContent = ctrl.help;
      field.appendChild(help);
    }
    return field;
  }

  function setConfig(ctrl, rawVal) {
    window.CONFIG[ctrl.key] = toConfigValue(ctrl.kind, rawVal);
    persist();
    refreshInterface();
  }

  function syncControlsFromConfig() {
    SCHEMA.forEach(function (grp) {
      grp.controls.forEach(function (ctrl) {
        var current = toControlValue(ctrl.kind, window.CONFIG[ctrl.key]);
        (els[ctrl.key] || []).forEach(function (input) {
          if (input.tagName === "SELECT") {
            input.value = current;
          } else { // radio
            input.checked = input.value === current;
            var row = input.closest(".rcp-radio");
            if (row) row.classList.toggle("rcp-checked", input.checked);
          }
        });
      });
    });
  }

  function buildPanel() {
    injectStyles();

    var overlay = document.createElement("div");
    overlay.id = "rcp-overlay";

    var panel = document.createElement("aside");
    panel.id = "rcp-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Research control panel");

    // Header
    var head = document.createElement("div");
    head.className = "rcp-head";
    head.innerHTML = '<div><h2>Research Controls</h2><p>Interface settings · not visible to participants</p></div>';
    var x = document.createElement("button");
    x.className = "rcp-x";
    x.setAttribute("aria-label", "Close");
    x.innerHTML = "&times;";
    x.addEventListener("click", close);
    head.appendChild(x);
    panel.appendChild(head);

    // Body
    var body = document.createElement("div");
    body.className = "rcp-body";

    SCHEMA.forEach(function (grp) {
      var g = document.createElement("div");
      g.className = "rcp-group";

      if (grp.advanced) {
        var toggle = document.createElement("button");
        toggle.className = "rcp-adv-toggle";
        var arrow = document.createElement("span");
        arrow.textContent = "▸";
        var txt = document.createElement("span");
        txt.textContent = grp.group;
        toggle.appendChild(arrow);
        toggle.appendChild(txt);

        var wrap = document.createElement("div");
        wrap.className = "rcp-adv-wrap";
        grp.controls.forEach(function (ctrl) { wrap.appendChild(buildControl(ctrl)); });

        toggle.addEventListener("click", function () {
          var shown = wrap.classList.toggle("rcp-shown");
          arrow.textContent = shown ? "▾" : "▸";
        });
        g.appendChild(toggle);
        g.appendChild(wrap);
      } else {
        var title = document.createElement("p");
        title.className = "rcp-group-title";
        title.textContent = grp.group;
        g.appendChild(title);
        grp.controls.forEach(function (ctrl) { g.appendChild(buildControl(ctrl)); });
      }
      body.appendChild(g);
    });
    panel.appendChild(body);

    // Note + footer
    var note = document.createElement("p");
    note.className = "rcp-note";
    note.textContent = "Settings are saved in this browser and stay after refresh. Press Ctrl/Cmd + Shift + 0 to reopen this panel.";
    panel.appendChild(note);

    var foot = document.createElement("div");
    foot.className = "rcp-foot";
    var reset = document.createElement("button");
    reset.className = "rcp-btn rcp-btn-reset";
    reset.textContent = "Reset to defaults";
    reset.addEventListener("click", resetDefaults);
    var done = document.createElement("button");
    done.className = "rcp-btn rcp-btn-done";
    done.textContent = "Done";
    done.addEventListener("click", close);
    foot.appendChild(reset);
    foot.appendChild(done);
    panel.appendChild(foot);

    overlay.addEventListener("click", close);
    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    // Floating open button (only exists in research mode)
    var fab = document.createElement("button");
    fab.id = "rcp-fab";
    fab.setAttribute("aria-label", "Open research controls");
    fab.title = "Research controls";
    fab.innerHTML = "&#9881;"; // gear
    fab.addEventListener("click", open);
    document.body.appendChild(fab);

    return { overlay: overlay, panel: panel };
  }

  function resetDefaults() {
    var d = window.CONFIG_DEFAULTS || {};
    Object.keys(d).forEach(function (k) { window.CONFIG[k] = d[k]; });
    persist();
    syncControlsFromConfig();
    refreshInterface();
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 6. OPEN / CLOSE + RESEARCH-MODE GATING
   * ───────────────────────────────────────────────────────────────────────── */
  var built = null;

  function ensureBuilt() {
    if (!built) built = buildPanel();
    return built;
  }

  function open() {
    var b = ensureBuilt();
    syncControlsFromConfig();
    b.overlay.classList.add("rcp-open");
    b.panel.classList.add("rcp-open");
    try { sessionStorage.setItem("rcpOpen", "1"); } catch (e) {}
  }

  function close() {
    if (!built) return;
    built.overlay.classList.remove("rcp-open");
    built.panel.classList.remove("rcp-open");
    try { sessionStorage.removeItem("rcpOpen"); } catch (e) {}
  }

  function toggle() {
    if (built && built.panel.classList.contains("rcp-open")) close();
    else open();
  }

  // Research mode is ON when ?research=1 is present, or the researcher has
  // opened the panel earlier in this browser tab (sessionStorage). Participants
  // trigger neither, so they never see the gear button or the panel.
  function isResearchMode() {
    try {
      var p = new URLSearchParams(window.location.search);
      var flag = p.get("research");
      if (flag === "1" || flag === "true") return true;
    } catch (e) {}
    try { if (sessionStorage.getItem("rcpOpen") === "1") return true; } catch (e) {}
    return false;
  }

  function init() {
    // Keyboard shortcut is always armed so a researcher can summon the panel on
    // any page, but it does nothing meaningful for a participant who won't press
    // it. (Ctrl/Cmd + Shift + 0 — chosen to avoid clashing with browser reload.)
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "0" || e.code === "Digit0")) {
        e.preventDefault();
        ensureBuilt();
        toggle();
      }
    });

    if (isResearchMode()) {
      ensureBuilt();
      // Auto-open the first time it's requested via the URL, so the researcher
      // immediately sees the controls.
      var p = new URLSearchParams(window.location.search);
      if (p.get("research") === "1" || p.get("research") === "true" ||
          (function () { try { return sessionStorage.getItem("rcpOpen") === "1"; } catch (e) { return false; } })()) {
        open();
      }
    }

    // Expose a tiny API for QA / console use.
    window.ResearchPanel = { open: open, close: close, toggle: toggle };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();