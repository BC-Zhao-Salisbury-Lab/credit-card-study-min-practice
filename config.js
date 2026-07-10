/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CENTRAL INTERFACE CONFIGURATION   (researcher-facing)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  This is the single place to control the INTERFACE CONDITION each participant
 *  sees — which visualization is drawn, how the timeline controls behave, how
 *  much explanatory text appears, and how tightly the page is spaced.
 *
 *  Researchers do NOT need to edit this file. Everything below can be changed
 *  from the on-screen Research Control Panel (open it by adding ?research=1 to
 *  the URL, or press  Ctrl/Cmd + Shift + R ). Settings chosen in the panel are
 *  remembered in the browser (localStorage) and survive a refresh.
 *
 *  It deliberately does NOT touch any of the following, which live in
 *  script.js / visualizations.js and are left untouched:
 *
 *      • payoff / APR / interest calculations
 *      • payment logic and the slider math
 *      • the experimental version system  (?v=0 / ?v=1 / ?v=2)
 *      • Qualtrics integration and research data collection
 *
 *  ───────────────────────────────────────────────────────────────────────────
 *  THE TWO CORE VARIABLES (also editable here as a fallback):
 *
 *   activeStrategy   1–9  → which chart/visualization is drawn.
 *   tabDisplayMode   0/1/2 → timeline tabs: 0 hide · 1 show current only · 2 show all.
 *
 *  THE THREE INFORMATION MODES (content verbosity):
 *
 *   "minimal"  – Resembles a real credit-card company page. Essential info only.
 *   "standard" – Moderate explanation: hero, short option descriptions, slider guidance.
 *   "detailed" – Every explanation: full descriptions, chart commentary, helper text.
 *
 *  Every visibility flag accepts:  true (show) · false (hide) · "auto" (follow the mode).
 * ═══════════════════════════════════════════════════════════════════════════
 */
window.CONFIG = {
  // ── Core visualization variables (formerly ACTIVE_STRATEGY / TAB_DISPLAY_MODE) ─
  activeStrategy:  8,   // 1–9: which chart is drawn (see visualizations.js header)
  tabDisplayMode:  2,   // 0 hide tabs · 1 show current tab only · 2 show all tabs

  // ── Information mode (content verbosity) ───────────────────────────────────
  infoDensity: "minimal",

  // ── Independent component toggles  (true / false / "auto") ─────────────────
  showHero:                      "auto",  // instructional banner beneath the navbar
  showAccountDetails:            "auto",  // account no. / due date / status bar
  showSummaryCards:              "auto",  // Time-to-Pay-Off / Interest / Total cards
  showVisualizationDescriptions: "auto",  // italic chart caption + remainder note
  showSliderDescription:         "auto",  // slider intro line + dynamic callout
  showDisclaimer:                "auto",  // "* Assumes 22.99% APR…" fine print
  showTimelineTabs:              "auto",  // chart time-window tabs (strategies 1 & 7)
  showTooltips:                  "auto",  // Chart.js hover tooltips

  // ── Layout spacing (independent of infoDensity) ────────────────────────────
  //   "auto"  → delivered responsive spacing: roomy on tall screens, automatically
  //             tightening on short ones so everything still fits (DEFAULT).
  //   true    → force the tight, above-the-fold spacing at every screen height.
  //   false   → force roomier, more comfortable spacing (may add some scrolling).
  compactLayout: "auto",

  // ── Vertical alignment (independent of infoDensity) ────────────────────────
  //   true  → when the page is shorter than the screen (e.g. "minimal" mode),
  //           center the content in the leftover space. (DEFAULT)
  //   false → anchor content to the top; leftover space sits above the footer.
  centerContentVertically: true
};


/* ───────────────────────────────────────────────────────────────────────────
 * PERSISTENCE (GitHub Pages has no backend, so researcher choices are stored
 * in the browser's localStorage). This block runs BEFORE visualizations.js and
 * script.js read any value, so a saved condition is in effect from first paint.
 *
 *  • CONFIG_DEFAULTS  – an untouched snapshot of the delivered defaults above,
 *                       used by the "Reset to Defaults" button in the panel.
 *  • Any saved keys are merged over the defaults.
 * ─────────────────────────────────────────────────────────────────────────── */
window.CONFIG_DEFAULTS = JSON.parse(JSON.stringify(window.CONFIG));
window.CONFIG_STORAGE_KEY = "ccStudyResearchConfig";

(function loadSavedConfig() {
  try {
    var raw = window.localStorage.getItem(window.CONFIG_STORAGE_KEY);
    if (!raw) return;
    var saved = JSON.parse(raw);
    if (saved && typeof saved === "object") {
      for (var k in saved) {
        if (Object.prototype.hasOwnProperty.call(saved, k) &&
            Object.prototype.hasOwnProperty.call(window.CONFIG, k)) {
          window.CONFIG[k] = saved[k];
        }
      }
    }
  } catch (e) { /* private mode / disabled storage: fall back to defaults */ }
})();

// Persist the current CONFIG. Called by the Research Control Panel on any change.
window.saveConfig = function saveConfig() {
  try {
    window.localStorage.setItem(window.CONFIG_STORAGE_KEY, JSON.stringify(window.CONFIG));
  } catch (e) { /* storage unavailable: settings simply won't persist */ }
};


/* ───────────────────────────────────────────────────────────────────────────
 * Everything below is the machinery that translates CONFIG into the interface.
 * Researchers should not need to edit past this line.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  // What each information mode implies for every "auto" visibility flag, plus
  // the option-description style. compactLayout is NOT set here — it is an
  // independent spacing knob handled separately.
  var PRESETS = {
    minimal: {
      showHero: false,
      showAccountDetails: true,
      showSummaryCards: true,
      showVisualizationDescriptions: false,
      showSliderDescription: false,
      showDisclaimer: true,
      showTimelineTabs: true,
      showTooltips: true,
      optionDesc: "amount"   // dollar amount only
    },
    standard: {
      showHero: true,
      showAccountDetails: true,
      showSummaryCards: true,
      showVisualizationDescriptions: false,
      showSliderDescription: true,
      showDisclaimer: true,
      showTimelineTabs: true,
      showTooltips: true,
      optionDesc: "short"    // amount + brief meaning
    },
    detailed: {
      showHero: true,
      showAccountDetails: true,
      showSummaryCards: true,
      showVisualizationDescriptions: true,
      showSliderDescription: true,
      showDisclaimer: true,
      showTimelineTabs: true,
      showTooltips: true,
      optionDesc: "full"     // original full descriptions
    }
  };

  // Option-description variants keyed by the radio `value` so the mapping is
  // exact. Dollar amounts are preserved verbatim in every variant; only the
  // educational elaboration is trimmed. The custom-amount row has no
  // description element, so it is unaffected.
  var SHORT_DESCS = {
    "dynamic-min": "Starts at $38.00 — minimum to avoid late fees",
    "1836.90":     "$1,836.90 — clears last cycle’s charges",
    "1875.11":     "$1,875.11 — pays off everything"
  };
  var AMOUNT_DESCS = {
    "dynamic-min": "Minimum $38.00",
    "1836.90":     "$1,836.90",
    "1875.11":     "$1,875.11"
  };

  function resolve() {
    var cfg  = window.CONFIG || {};
    var mode = String(cfg.infoDensity || "standard").toLowerCase();
    if (!PRESETS[mode]) mode = "standard";
    var preset = PRESETS[mode];

    // Explicit true/false wins; anything else ("auto"/undefined) follows preset.
    function pick(key) {
      var v = cfg[key];
      return (v === true || v === false) ? v : preset[key];
    }

    // compactLayout is tri-state: true | false | "auto".
    var compact = (cfg.compactLayout === true || cfg.compactLayout === false)
                    ? cfg.compactLayout
                    : "auto";

    // centerContentVertically defaults ON; only an explicit false disables it.
    var vcenter = (cfg.centerContentVertically !== false);

    return {
      mode:                          mode,
      showHero:                      pick("showHero"),
      showAccountDetails:            pick("showAccountDetails"),
      showSummaryCards:              pick("showSummaryCards"),
      showVisualizationDescriptions: pick("showVisualizationDescriptions"),
      showSliderDescription:         pick("showSliderDescription"),
      showDisclaimer:                pick("showDisclaimer"),
      showTimelineTabs:              pick("showTimelineTabs"),
      showTooltips:                  pick("showTooltips"),
      compactLayout:                 compact,
      centerContentVertically:       vcenter,
      optionDesc:                    preset.optionDesc
    };
  }

  function setClass(cond, cls) {
    if (document.body) document.body.classList.toggle(cls, !!cond);
  }

  // Swap option descriptions between full / short / amount. The original text
  // is cached once so any mode can always be restored losslessly.
  function applyOptionDescriptions(state) {
    var descs = document.querySelectorAll(".option-row .option-desc");
    for (var i = 0; i < descs.length; i++) {
      var el = descs[i];
      if (!el.getAttribute("data-desc-full")) {
        el.setAttribute("data-desc-full", el.textContent.trim());
      }
      var row   = el.closest(".option-row");
      var radio = row ? row.querySelector('input[name="payOption"]') : null;
      var val   = radio ? radio.value : "";

      if (state.optionDesc === "short" && SHORT_DESCS[val]) {
        el.textContent = SHORT_DESCS[val];
      } else if (state.optionDesc === "amount" && AMOUNT_DESCS[val]) {
        el.textContent = AMOUNT_DESCS[val];
      } else {
        el.textContent = el.getAttribute("data-desc-full");
      }
    }
  }

  // Chart.js tooltips are canvas-drawn, so they can't be toggled with CSS.
  // Setting the library default (before charts are built in script.js) turns
  // them on/off without editing visualizations.js. If a chart already exists we
  // update it in place and redraw — Chart.update('none') repaints only; it does
  // NOT recompute data or touch any research tracking.
  function applyTooltips(state) {
    if (window.Chart && Chart.defaults && Chart.defaults.plugins &&
        Chart.defaults.plugins.tooltip) {
      Chart.defaults.plugins.tooltip.enabled = !!state.showTooltips;
    }
    try {
      var ch = (window.Chart && typeof Chart.getChart === "function")
                 ? Chart.getChart("stackedChart") : null;
      if (ch && ch.options) {
        ch.options.plugins = ch.options.plugins || {};
        ch.options.plugins.tooltip = ch.options.plugins.tooltip || {};
        ch.options.plugins.tooltip.enabled = !!state.showTooltips;
        ch.update("none");
      }
    } catch (e) { /* non-fatal: chart not built yet */ }
  }

  function apply() {
    if (!document.body) return;
    var s = resolve();

    // Mode marker (available for any future mode-specific CSS / analytics).
    document.body.classList.remove("density-minimal", "density-standard", "density-detailed");
    document.body.classList.add("density-" + s.mode);

    // Spacing knob: "auto" applies neither class and keeps the delivered
    // responsive behaviour; true forces compact; false forces roomy.
    setClass(s.compactLayout === true,  "cfg-compact");
    setClass(s.compactLayout === false, "cfg-roomy");

    // Vertical centering of short pages (footer stays pinned to the bottom).
    setClass(s.centerContentVertically, "cfg-vcenter");

    // Component visibility (CSS hides when the matching class is present).
    setClass(!s.showHero,                      "cfg-hide-hero");
    setClass(!s.showAccountDetails,            "cfg-hide-account");
    setClass(!s.showSummaryCards,              "cfg-hide-summary");
    setClass(!s.showVisualizationDescriptions, "cfg-hide-viz-desc");
    setClass(!s.showSliderDescription,         "cfg-hide-slider-desc");
    setClass(!s.showDisclaimer,                "cfg-hide-disclaimer");
    setClass(!s.showTimelineTabs,              "cfg-hide-timeline-tabs");

    applyOptionDescriptions(s);
    applyTooltips(s);

    window.__resolvedConfig = s;   // exposed for QA / debugging
  }

  // Expose for live re-application from the console or the control panel.
  window.applyInterfaceConfig = apply;

  // Run immediately (this script sits at the end of <body>, so the DOM it
  // touches already exists and charts inherit the tooltip default before they
  // are built), then again on DOMContentLoaded as a safety net.
  apply();
  document.addEventListener("DOMContentLoaded", apply);
})();