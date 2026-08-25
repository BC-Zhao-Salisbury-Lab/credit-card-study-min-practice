// ─── Study Layout Control (replaces the old ?v= version system) ─────────────
// The active layout (1–7) is resolved centrally in config.js from ?layout= or
// the Research Control Panel. Section visibility is driven entirely by the body
// classes config.js applies (feat-slider / feat-graph / feat-choice-msgs …) via
// styles.css, so this file no longer force-toggles inline display.
const urlParams = new URLSearchParams(window.location.search);
function getLayout() {
  return (typeof window.getActiveLayout === 'function') ? window.getActiveLayout() : 1;
}
function layoutSpec() {
  return (typeof window.getLayoutSpec === 'function') ? window.getLayoutSpec() : { graphTabs: [] };
}
const version = getLayout(); // retained name for downstream research-data fields

console.log("Current detected study layout:", version);

// Visibility is handled by CSS body classes (config.js). Kept as a no-op so any
// legacy callers remain safe.
function applyVersionUI() { /* layout visibility handled via CSS classes */ }

// ─── Constants & Parameters ─────────────────────────────────
const CURRENT_BALANCE = 2675.11;
const STATEMENT_BALANCE = 2136.90;
const ANNUAL_RATE     = 0.2138; // 21.38%
const MONTHLY_RATE    = ANNUAL_RATE / 12;
const MIN_PAYMENT     = 43.00;

// The slider runs 0 → current balance (its right end is the current balance),
// with markers for the minimum payment and the statement balance along the way.
const SLIDER_MAX = CURRENT_BALANCE;

// At or below the pure-interest point (statement × monthly rate) the balance can
// never be paid off. The slider is NOT clamped there — participants may slide
// into that zone — but the message switches to the "never paid off" wording.
const INFINITE_POINT = STATEMENT_BALANCE * MONTHLY_RATE;   // ≈ 38.07

// Money formatter with thousands separators, e.g. 1836.9 → "$1,836.90".
function fmt(n) {
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Slider Logging Behavior ────────────────────────────────
// The range slider fires 'input' continuously while dragging, which previously
// logged every intermediate value (inflating interactionCount and allChoices).
// With commit logging on, a slider value is recorded only when the participant
// (a) releases the slider, or (b) holds a position for SLIDER_LOG_DWELL_MS.
// Live chart/summary rendering is unaffected — it still updates on every tick.
// Set SLIDER_COMMIT_LOGGING = false to restore the legacy log-every-tick behavior.
const SLIDER_COMMIT_LOGGING = true;
const SLIDER_LOG_DWELL_MS   = 1000; // pause (ms) before a held value is logged

// ─── State Management ───────────────────────────────────────
let activeChart = null;
let submitted   = false;

const tracking = {
  sessionId: Math.floor(100000 + Math.random() * 900000),
  conditionVersion: version,
  strategyIndex: typeof ACTIVE_STRATEGY !== 'undefined' ? ACTIVE_STRATEGY : null,
  startTime: Date.now(),
  endTime: null,
  interactionCount: 0,
  firstChoice: null,
  finalChoice: null,
  allChoices: [],
  sliderValues: [],
  customAmount: null,
  usedSlider: false,
  usedCustomInput: false,
  firstSliderUseTime: null,
  firstCustomInputTime: null,

  // ── Richer interaction telemetry (added for the research team) ───────────
  mouseClicks: 0,          // total mouse clicks anywhere on the page
  mouseMoveCount: 0,       // number of mousemove samples (throttled)
  mousePath: [],           // throttled [t(ms), x, y] samples of cursor movement
  mouseDistancePx: 0,      // total cursor travel distance in pixels
  keyPressCount: 0,        // total key presses
  hoverEvents: [],         // [t(ms), target] when hovering key elements
  optionHoverCounts: {},   // how many times each payment option was hovered
  sliderGrabs: 0,          // times the slider was grabbed (pointer/mouse down)
  scrollDepthMax: 0,       // furthest scroll depth reached (0–1 of page height)
  scrollCount: 0,          // number of scroll events (throttled)
  focusBlurEvents: [],     // [t(ms), 'blur'|'focus'] tab visibility changes
  timeHiddenMs: 0,         // total time the page/tab was hidden
  firstInteractionTime: null, // ms from load to the very first interaction
  clickLog: []             // [t(ms), label] of meaningful clicks (options, submit, notches)
};

// ─── UI Element Selectors ───────────────────────────────────
const yearsOut     = document.getElementById("yearsOut");
const interestOut  = document.getElementById("interestOut");
const totalOut     = document.getElementById("totalOut");
const paymentRange = document.getElementById("paymentRange");
const paymentInput = document.getElementById("paymentInput");

const descPayment        = document.getElementById("descPayment");
const descYears          = document.getElementById("descYears");
const descTotal          = document.getElementById("descTotal");
const descAccruedInterest = document.getElementById("descAccruedInterest");

const chartCtx     = document.getElementById("stackedChart") ? document.getElementById("stackedChart").getContext("2d") : null;

// ─── Last-Render Memory (for the Research Control Panel) ─────
// Records how the visualization was last drawn so a researcher changing a
// display setting (e.g. chart type) can redraw with the participant's CURRENT
// selection. This is display state only — it does NOT affect calculations,
// logged research data, experimental version, or Qualtrics transmission.
let _lastRenderMode = 'fixed';       // 'fixed' (a payment amount) or 'dynamic' (min trajectory)
let _lastRenderPayment = MIN_PAYMENT;

// ─── Mathematical Core Calculation Engines ──────────────────
function computePayoffMetrics(monthlyPayment) {
  // "Paid off" is defined as clearing the statement balance ($2,136.90).
  // The remaining $538.21 (current minus statement) is a separate future obligation
  // and is shown as a note on charts but excluded from these calculations.

  if (monthlyPayment >= STATEMENT_BALANCE) {
    return { months: 1, totalPaid: STATEMENT_BALANCE, totalInterest: 0 };
  }

  if (monthlyPayment <= (STATEMENT_BALANCE * MONTHLY_RATE)) {
    return { months: Infinity, totalPaid: Infinity, totalInterest: Infinity };
  }

  let balance = STATEMENT_BALANCE;
  let totalPaid = 0;
  let totalInterest = 0;
  let months = 0;

  while (balance > 0 && months < 1200) {
    months++;
    const interest = balance * MONTHLY_RATE;
    const principal = Math.min(monthlyPayment - interest, balance);

    totalInterest += interest;
    balance       -= principal;
    totalPaid     += (interest + principal);
  }

  return { months, totalPaid, totalInterest };
}

function formatDurationText(totalMonths) {
  // Short form for summary cards — fits on one line
  if (totalMonths === Infinity || !isFinite(totalMonths)) return "Never";
  if (totalMonths <= 0) return "0 months";

  const years  = Math.floor(totalMonths / 12);
  const months = Math.round(totalMonths % 12);

  let result = "";
  if (years  > 0) result += `${years} yr${years  > 1 ? "s" : ""}`;
  if (months > 0) {
    if (result.length > 0) result += " ";
    result += `${months} mo`;
  }
  return result || "< 1 month";
}

function formatDurationLong(totalMonths) {
  // Long form for slider callout — full words, month count in parens
  if (totalMonths === Infinity || !isFinite(totalMonths)) return "an infinite horizon";
  if (totalMonths <= 0) return "0 months";

  const years  = Math.floor(totalMonths / 12);
  const months = Math.round(totalMonths % 12);

  let result = "";
  if (years  > 0) result += `${years} year${years  > 1 ? "s" : ""}`;
  if (months > 0) {
    if (result.length > 0) result += " and ";
    result += `${months} month${months > 1 ? "s" : ""}`;
  }
  const base = result || "less than a month";
  // When payoff is within a year, omit the redundant "(N months)" parenthetical.
  return totalMonths <= 12 ? base : base + ` (${totalMonths} months)`;
}

// ─── Message Builders (layouts 2–7) ─────────────────────────
// `detail` is "total" (cost + payoff time) or "breakdown" (+ interest & principal).
// Builders return HTML: time phrases and dollar amounts are wrapped in <strong>
// (bold black). Every number is computed from the constants + payoff engine.
function b(s) { return `<strong>${s}</strong>`; }

// Immediate payoff (pay the whole statement / current balance this month).
function msgImmediate(kind, amount, detail) {
  const bal = kind === "current" ? "current balance" : "statement balance";
  return detail === "breakdown"
    ? `If you pay this amount, you will pay off the ${bal} ${b("this month")} with ${b("$0 interest")} and ${b(fmt(amount) + " principal")}.`
    : `If you pay this amount, you will pay off the ${bal} ${b("this month")} with ${b("a total of " + fmt(amount))}.`;
}

function msgStatementText(detail) { return msgImmediate("statement", STATEMENT_BALANCE, detail); }
function msgCurrentText(detail)   { return msgImmediate("current",   CURRENT_BALANCE,   detail); }

// Recurring monthly payment. `lead` differs for the minimum vs a typed/slid amount.
function msgRecurring(lead, m, detail) {
  const principal = m.totalPaid - m.totalInterest;
  const time = formatDurationLong(m.months);
  return detail === "breakdown"
    ? `${lead}, you will pay off the statement balance in ${b(time)}, and you will end up paying ${b(fmt(m.totalInterest) + " interest")} and ${b(fmt(principal) + " principal")}, ${b("a total of " + fmt(m.totalPaid))}.`
    : `${lead}, you will pay off the statement balance in ${b(time)}, and you will end up paying ${b("a total of " + fmt(m.totalPaid))}.`;
}

function msgMinimumText(detail) {
  const lead = "If you pay only the minimum required amount each month, and you make no additional charges using this card";
  return msgRecurring(lead, computePayoffMetrics(MIN_PAYMENT), detail);
}

// A monthly payment of `v` (the custom "Other Amount" field, or the slider).
function msgAmountText(v, detail) {
  if (!isFinite(v)) return "";
  // Paying the whole balance (or more) this month: use the ENTERED amount for the
  // total/principal, while keeping the "statement balance" wording.
  if (v >= STATEMENT_BALANCE) return msgImmediate("statement", v, detail);

  const m = computePayoffMetrics(v);
  if (!isFinite(m.months)) {
    return `If you pay this amount each month, it will be lower than the monthly interest, so ${b("your balance will never be fully paid off")}.`;
  }
  const lead = "If you pay this amount each month, and you make no additional charges using this card";
  return msgRecurring(lead, m, detail);
}

// Fill the three fixed per-option messages (Statement / Current / Minimum).
// Runs on init and whenever the layout changes. Other Amount is filled on input.
function initChoiceMessages() {
  const spec   = layoutSpec();
  const detail = spec.choiceDetail;      // "total" | "breakdown" | null
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html ? "• " + html : ""; };
  set("msgStatement", detail && msgStatementText(detail));
  set("msgCurrent",   detail && msgCurrentText(detail));
  set("msgMinimum",   detail && msgMinimumText(detail));
  updateOtherMessage(parseFloat(paymentInput ? paymentInput.value : NaN));
}

// Live message under the Other Amount field (layouts 2 & 3 only).
function updateOtherMessage(v) {
  const el = document.getElementById("msgOther");
  if (!el) return;
  const spec = layoutSpec();
  if (!spec.choiceMsgs || !isFinite(v)) { el.innerHTML = ""; return; }
  el.innerHTML = "• " + msgAmountText(v, spec.choiceDetail);
}

// ─── UI Application Render Pipelines ────────────────────────
function updateStatusBadge(paymentAmount) {
  const badge = document.getElementById("accountStatusBadge");
  if (!badge) return;

  if (paymentAmount >= STATEMENT_BALANCE) {
    badge.textContent = "✓ Balance Fully Cleared";
    badge.style.backgroundColor = "#2E6B4F";
    badge.style.color = "#FFFFFF";
  } else {
    badge.textContent = "Payment Required";
    badge.style.backgroundColor = ""; // Falls back to default CSS values
    badge.style.color = "";
  }
}

// CSS left offset that tracks the slider thumb centre. The thumb is ~20px wide,
// so its centre travels from 10px to (width−10px); this maps a 0→1 fraction onto
// that inset range so bubbles/notches line up with the thumb.
const SLIDER_THUMB = 20;
function thumbLeft(v) {
  const pct = Math.max(0, Math.min(1, v / SLIDER_MAX));
  return `calc(${(pct * 100).toFixed(3)}% - ${((pct - 0.5) * SLIDER_THUMB).toFixed(2)}px)`;
}

// Position the floating value bubble — ALWAYS centred over the thumb. The bubble
// stays hidden until the participant first interacts with the slider.
function positionSliderBubble(v) {
  const bubble = document.getElementById("sliderBubble");
  if (!bubble || !paymentRange) return;
  bubble.textContent = fmt(v);
  bubble.style.left = thumbLeft(v);
  bubble.style.transform = "translateX(-50%)";
  bubble.style.visibility = tracking.usedSlider ? "visible" : "hidden";
}

// Place the minimum-payment and statement-balance markers on the track at their
// values, with labels beneath. Labels are nudged inward at the edges so they
// don't overflow the slider (the minimum sits near the far left).
function positionNotches() {
  const place = (markerId, labelId, val) => {
    const left = thumbLeft(val);
    const marker = document.getElementById(markerId);
    if (marker) marker.style.left = left;
    const label = document.getElementById(labelId);
    if (label) {
      label.style.left = left;
      const pct = Math.max(0, Math.min(1, val / SLIDER_MAX));
      if (pct > 0.82)      label.style.transform = "translateX(calc(-100% + 8px))";
      else if (pct < 0.18) label.style.transform = "translateX(-8px)";
      else                 label.style.transform = "translateX(-50%)";
    }
  };
  place("notchMin",       "notchMinLabel",       MIN_PAYMENT);
  place("notchStatement", "notchStatementLabel", STATEMENT_BALANCE);
}

// Jump the slider to a value (used by the clickable notches). Behaves like a
// deliberate slider stop: renders visuals and logs the choice, but — like the
// slider itself — stays unlinked from the radio selection.
function setSliderValue(v) {
  if (!paymentRange) return;
  let val = Math.max(0, Math.min(SLIDER_MAX, v));
  paymentRange.value = String(val);
  if (!tracking.usedSlider) {
    tracking.usedSlider = true;
    tracking.firstSliderUseTime = Date.now() - tracking.startTime;
  }
  _animateNext = true;
  renderSlider(val);
  commitSliderChoice(val);
}

// Update the summary "tab" cards above the graph (Principal / Interest / Total /
// Time to Pay Off). CSS decides which are visible per layout (L6: total+time,
// L7: all four). Values reflect the current slider payment.
function updateCards(v) {
  let months, total, interest, principal, inf = false;
  if (v >= STATEMENT_BALANCE) {
    // Paying the whole balance (or more) this month: use the ENTERED amount for
    // total & principal ($0 interest), paid off in 1 month.
    months = 1; total = v; interest = 0; principal = v;
  } else {
    const m = computePayoffMetrics(v);
    inf = !isFinite(m.totalPaid);
    months = m.months; total = m.totalPaid; interest = m.totalInterest;
    principal = inf ? Infinity : (m.totalPaid - m.totalInterest);
  }
  const p = document.getElementById("principalOut");
  if (p)           p.textContent           = inf ? "Infinite" : fmt(principal);
  if (interestOut) interestOut.textContent = inf ? "Infinite" : fmt(interest);
  if (totalOut)    totalOut.textContent    = inf ? "Infinite" : fmt(total);
  // Time-to-pay-off card: month count in parentheses on a SECOND line, and only
  // when payoff takes more than 12 months.
  if (yearsOut) {
    if (inf) {
      yearsOut.textContent = "Never";
    } else if (months <= 12) {
      yearsOut.textContent = formatDurationText(months);
    } else {
      // Duration and "(N months)" are each kept intact; the value wraps between
      // them only if the card is too narrow (layout 7), otherwise it stays on one
      // line (layout 6).
      yearsOut.innerHTML = `<span class="dur">${formatDurationText(months)}</span> <span class="months-paren">(${months} months)</span>`;
    }
  }
}

// Master slider renderer (layouts 4–7). VISUAL ONLY: updates the bubble, the
// slider message (L4/L5), the summary cards, and the graph (L6/L7). It never
// touches the radio selection or the Other Amount field — the slider and graph
// are decoupled from the participant's actual choice.
function renderSlider(v) {
  _lastRenderPayment = v;
  positionSliderBubble(v);

  const msgEl = document.getElementById("sliderMessageText");
  if (msgEl) msgEl.innerHTML = msgAmountText(v, layoutSpec().sliderDetail);

  updateStatusBadge(v);
  updateCards(v);

  if (layoutSpec().graph) updateCharts(v);
}

// Draw the finalized-survey graph (visualizations.js). Layout 7 shows the
// interest/principal breakdown; layout 6 shows a single "total paid" series.
// Driven by the slider value.
function updateCharts(paymentAmount, animate = true) {
  if (!chartCtx) return;
  if (typeof _animateNext !== 'undefined') _animateNext = animate;
  if (typeof window.renderFinalGraph !== 'function') return;

  const breakdown = layoutSpec().graphTabs.indexOf('interest') !== -1; // layout 7
  activeChart = window.renderFinalGraph(
    chartCtx, paymentAmount, STATEMENT_BALANCE, MONTHLY_RATE, breakdown, activeChart
  );
}

// Apply everything that depends on the active layout at runtime: fixed choice
// messages, notch positions, and an initial slider/card/graph render.
// Safe to call repeatedly (init + Research Control Panel changes).
function applyLayoutRuntime() {
  initChoiceMessages();
  positionNotches();
  if (layoutSpec().slider) {
    let v = paymentRange ? parseFloat(paymentRange.value) : MIN_PAYMENT;
    if (!isFinite(v)) v = MIN_PAYMENT;
    _animateNext = true;
    renderSlider(v);
  }
}

// Re-apply after the Research Control Panel changes a setting (layout OR chart
// type). Refresh ACTIVE_STRATEGY from CONFIG, drop the old chart, then redraw.
window.rerenderStudyVisualization = function rerenderStudyVisualization() {
  if (typeof window.applyStrategyConfig === 'function') window.applyStrategyConfig();
  if (activeChart) { try { activeChart.destroy(); } catch (e) {} activeChart = null; }
  applyLayoutRuntime();
};

// ─── Submit gating ──────────────────────────────────────────
// The participant cannot submit until they have selected one of the four payment
// options (and, for "Other Amount," entered a value greater than $0).
const submitSessionBtn = document.getElementById("submitSessionBtn");
function hasValidChoice() {
  const checked = document.querySelector('input[name="payOption"]:checked');
  if (!checked) return false;
  if (checked.value === 'other') {
    const val = parseFloat(paymentInput ? paymentInput.value : NaN);
    return isFinite(val) && val > 0;
  }
  return true;
}
function updateSubmitState() {
  if (!submitSessionBtn || submitted) return;
  const ok = hasValidChoice();
  submitSessionBtn.disabled = !ok;
  const hint = document.getElementById("submitHint");
  if (hint) hint.style.display = ok ? "none" : "";
  // Tell a Qualtrics parent frame whether a valid option is currently chosen
  // (used to enable/disable its Next button), and keep the latest choice data
  // available so advancing via Next still captures the response.
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: "ccChoice",
        valid: ok,
        payload: ok ? getSessionData() : null
      }, "*");
    }
  } catch (e) { /* not embedded / blocked: ignore */ }
}

// ─── Interactive Form Event Listeners ───────────────────────
// Selecting a radio records the participant's choice. It does NOT drive the
// slider or graph (those are independent visuals).
document.querySelectorAll('input[name="payOption"]').forEach(radio => {
  radio.addEventListener('change', () => {
    tracking.interactionCount++;
    if (!tracking.firstChoice) { tracking.firstChoice = radio.value; }
    tracking.finalChoice = radio.value;

    if (radio.value === 'other') {
      const val = parseFloat(paymentInput.value);
      if (isFinite(val)) {
        tracking.customAmount = Number(val.toFixed(2));
        tracking.allChoices.push(Number(val.toFixed(2)));
      }
    } else {
      // Picking a fixed option resets any amount typed into "Other Amount".
      if (paymentInput) paymentInput.value = "";
      tracking.customAmount = null;
      updateOtherMessage(NaN);
      tracking.allChoices.push(Number((+radio.value).toFixed(2)));
    }
    updateSubmitState();
  });
});

// Guards against double-logging the same value (e.g. a dwell-log followed by a
// release at the same position) and holds the pending dwell timer.
let _lastLoggedSliderValue = null;
let _sliderDwellTimer      = null;

// Records a slider stop into the research log (release / dwell). The slider is a
// visual explorer, so its values are logged for research but are kept SEPARATE
// from the submitted choice — it does not set tracking.customAmount.
function commitSliderChoice(val) {
  const rounded = Number(val.toFixed(2));
  if (rounded === _lastLoggedSliderValue) return; // unchanged since last log
  _lastLoggedSliderValue = rounded;
  tracking.interactionCount++;
  tracking.allChoices.push(rounded);
  if (Array.isArray(tracking.sliderValues)) tracking.sliderValues.push(rounded);
}

if (paymentRange) {
  paymentRange.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);

    // First-touch timing (also reveals the value bubble for the first time).
    if (!tracking.usedSlider) {
      tracking.usedSlider = true;
      tracking.firstSliderUseTime = Date.now() - tracking.startTime;
    }

    // Visual-only render (bubble + message + graph). Choices untouched. The
    // slider may enter the un-payable zone; the message handles that wording.
    _animateNext = false;
    renderSlider(val);

    if (SLIDER_COMMIT_LOGGING) {
      if (_sliderDwellTimer) clearTimeout(_sliderDwellTimer);
      _sliderDwellTimer = setTimeout(() => commitSliderChoice(val), SLIDER_LOG_DWELL_MS);
    } else {
      tracking.interactionCount++;
      tracking.allChoices.push(Number(val.toFixed(2)));
      if (Array.isArray(tracking.sliderValues)) tracking.sliderValues.push(Number(val.toFixed(2)));
    }
  });

  paymentRange.addEventListener('change', (e) => {
    if (!SLIDER_COMMIT_LOGGING) return;
    if (_sliderDwellTimer) { clearTimeout(_sliderDwellTimer); _sliderDwellTimer = null; }
    commitSliderChoice(parseFloat(e.target.value));
  });

  // Clickable markers (marker + its label): jump the slider straight to the
  // minimum payment or the statement balance without dragging precisely.
  const jump = (val) => () => setSliderValue(val);
  ["notchMin", "notchMinLabel"].forEach(id => {
    const el = document.getElementById(id); if (el) el.addEventListener("click", jump(MIN_PAYMENT));
  });
  ["notchStatement", "notchStatementLabel"].forEach(id => {
    const el = document.getElementById(id); if (el) el.addEventListener("click", jump(STATEMENT_BALANCE));
  });
}

// Other Amount field: records the custom choice and updates its message (layouts
// 2 & 3). Selecting this field checks the Other radio, but does NOT move the slider.
if (paymentInput) {
  paymentInput.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);

    if (!tracking.usedCustomInput) {
      tracking.usedCustomInput = true;
      tracking.firstCustomInputTime = Date.now() - tracking.startTime;
    }
    tracking.interactionCount++;

    const customRadio = document.getElementById("radioOther");
    if (customRadio) {
      customRadio.checked = true;
      if (!tracking.firstChoice) tracking.firstChoice = "other";
      tracking.finalChoice = "other";
    }

    if (isNaN(val) || val < 0) { updateOtherMessage(NaN); updateSubmitState(); return; }
    if (val > CURRENT_BALANCE) {
      val = CURRENT_BALANCE;
      paymentInput.value = CURRENT_BALANCE.toFixed(2);
    }

    tracking.allChoices.push(Number(val.toFixed(2)));
    tracking.customAmount = Number(val.toFixed(2));
    updateOtherMessage(val);
    updateSubmitState();
  });

  paymentInput.addEventListener('blur', () => {
    const val = parseFloat(paymentInput.value);
    if (!isNaN(val) && val >= 0) paymentInput.value = val.toFixed(2);
    updateOtherMessage(parseFloat(paymentInput.value));
    updateSubmitState();
  });
}

// ─── Data Extraction & PostMessage Core Logic ───────────────
function resolvePaymentLabel(choiceValue) {
  if (choiceValue === '43.00')      return 'Minimum Payment ($43.00)';
  if (choiceValue === '2136.90')    return 'Statement Balance ($2,136.90)';
  if (choiceValue === '2675.11')    return 'Current Balance ($2,675.11)';
  if (choiceValue === 'other')      return `Other Amount ($${tracking.customAmount !== null ? tracking.customAmount.toFixed(2) : '?'})`;
  return choiceValue ?? null;
}

function getSessionData() {
  tracking.endTime = Date.now();
  const totalTimeSeconds = (tracking.endTime - tracking.startTime) / 1000;

  return {
    sessionId:              tracking.sessionId,
    layout:                 getLayout(),
    conditionVersion:       tracking.conditionVersion,
    strategyIndex:          typeof ACTIVE_STRATEGY !== 'undefined' ? ACTIVE_STRATEGY : null,
    interactionCount:       tracking.interactionCount,
    firstChoice:            tracking.firstChoice,
    firstChoiceLabel:       resolvePaymentLabel(tracking.firstChoice),
    finalChoice:            tracking.finalChoice,
    finalChoiceLabel:       resolvePaymentLabel(tracking.finalChoice),
    allChoices:             tracking.allChoices,
    sliderValues:           tracking.sliderValues,
    customAmount:           tracking.customAmount,
    usedSlider:             tracking.usedSlider,
    usedCustomInput:        tracking.usedCustomInput,
    totalTimeSeconds:       Number(totalTimeSeconds.toFixed(2)),
    firstSliderUseSeconds:  tracking.firstSliderUseTime  !== null ? Number((tracking.firstSliderUseTime  / 1000).toFixed(2)) : null,
    firstCustomInputSeconds:tracking.firstCustomInputTime !== null ? Number((tracking.firstCustomInputTime / 1000).toFixed(2)) : null,

    // ── Interaction telemetry ────────────────────────────────────────────
    mouseClicks:            tracking.mouseClicks,
    mouseMoveSamples:       tracking.mouseMoveCount,
    mouseDistancePx:        tracking.mouseDistancePx,
    keyPresses:             tracking.keyPressCount,
    sliderGrabs:            tracking.sliderGrabs,
    scrollDepthMax:         tracking.scrollDepthMax,
    scrollCount:            tracking.scrollCount,
    optionHoverCounts:      tracking.optionHoverCounts,
    firstInteractionSeconds:tracking.firstInteractionTime !== null ? Number((tracking.firstInteractionTime / 1000).toFixed(2)) : null,
    timeHiddenSeconds:      Number((tracking.timeHiddenMs / 1000).toFixed(2)),
    tabBlurCount:           tracking.focusBlurEvents.filter(function (e) { return e[1] === 'blur'; }).length,
    // Detailed traces (downsampled; live in the raw record only)
    mousePath:              tracking.mousePath,
    clickLog:               tracking.clickLog,
    hoverEvents:            tracking.hoverEvents,
    focusBlurEvents:        tracking.focusBlurEvents,

    startTimestamp:         new Date(tracking.startTime).toISOString(),
    endTimestamp:           new Date(tracking.endTime).toISOString()
  };
}

// ─── Interaction Telemetry ──────────────────────────────────
// Passive listeners that enrich the research log with mouse / keyboard / scroll
// / attention data. Sampling is throttled and capped so the payload stays small.
(function setupTelemetry() {
  function now() { return Date.now() - tracking.startTime; }
  function markFirst() { if (tracking.firstInteractionTime === null) tracking.firstInteractionTime = now(); }

  // Clicks — total count + a light log of meaningful targets.
  document.addEventListener("click", function (e) {
    tracking.mouseClicks++;
    markFirst();
    var t = e.target, label = null;
    var row = t.closest ? t.closest(".option-row") : null;
    if (row) {
      var radio = row.querySelector('input[name="payOption"]');
      label = "option:" + (radio ? radio.value : "?");
    } else if (t.closest && t.closest("#submitSessionBtn")) label = "submit";
    else if (t.closest && t.closest(".slider-notch-labels")) label = "notch";
    else if (t.id === "paymentRange" || (t.closest && t.closest("#sliderSection"))) label = "slider";
    if (label && tracking.clickLog.length < 200) tracking.clickLog.push([now(), label]);
  }, true);

  // Mouse movement — throttled samples + total travel distance.
  var lastMove = -1000, lastX = null, lastY = null;
  document.addEventListener("mousemove", function (e) {
    var t = now();
    if (lastX !== null) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      tracking.mouseDistancePx += Math.round(Math.sqrt(dx * dx + dy * dy));
    }
    lastX = e.clientX; lastY = e.clientY;
    if (t - lastMove >= 150) {
      lastMove = t;
      tracking.mouseMoveCount++;
      markFirst();
      if (tracking.mousePath.length < 600) tracking.mousePath.push([t, e.clientX, e.clientY]);
    }
  }, true);

  // Keyboard.
  document.addEventListener("keydown", function () { tracking.keyPressCount++; markFirst(); }, true);

  // Hover on each payment option (count + timestamped events).
  document.querySelectorAll(".option-row").forEach(function (row) {
    var radio = row.querySelector('input[name="payOption"]');
    var key = radio ? radio.value : "option";
    row.addEventListener("mouseenter", function () {
      tracking.optionHoverCounts[key] = (tracking.optionHoverCounts[key] || 0) + 1;
      if (tracking.hoverEvents.length < 300) tracking.hoverEvents.push([now(), "option:" + key]);
    });
  });

  // Slider grabs (pointer/mouse/touch down on the range input).
  var rangeEl = document.getElementById("paymentRange");
  if (rangeEl) {
    ["mousedown", "touchstart", "pointerdown"].forEach(function (ev) {
      rangeEl.addEventListener(ev, function () { tracking.sliderGrabs++; markFirst(); }, { passive: true });
    });
  }

  // Scroll — throttled; track deepest scroll reached and a scroll-event count.
  var lastScroll = -1000;
  window.addEventListener("scroll", function () {
    var t = now();
    if (t - lastScroll < 150) return;
    lastScroll = t;
    tracking.scrollCount++;
    var doc = document.documentElement;
    var denom = (doc.scrollHeight - doc.clientHeight) || 1;
    var depth = Math.max(0, Math.min(1, (window.scrollY || doc.scrollTop || 0) / denom));
    if (depth > tracking.scrollDepthMax) tracking.scrollDepthMax = Number(depth.toFixed(3));
  }, { passive: true });

  // Attention — tab hide/show and total time hidden.
  var hiddenAt = null;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      hiddenAt = Date.now();
      if (tracking.focusBlurEvents.length < 100) tracking.focusBlurEvents.push([now(), "blur"]);
    } else {
      if (hiddenAt) { tracking.timeHiddenMs += (Date.now() - hiddenAt); hiddenAt = null; }
      if (tracking.focusBlurEvents.length < 100) tracking.focusBlurEvents.push([now(), "focus"]);
    }
  });
})();

function downloadSession() {
  if (submitted) return;
  submitted = true;
  const data = getSessionData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `credit_card_session_${data.sessionId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function sendToQualtrics(data) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "creditCardStudyData", payload: data }, "*");
  }
}

document.getElementById("submitSessionBtn").addEventListener("click", () => {
  if (submitted) return;
  if (!hasValidChoice()) { updateSubmitState(); return; }  // must pick an option first

  const finalData = getSessionData();
  console.log("Transmission initialized. Final Collected Session Log Data Packet:", finalData);

  // 1. Send to Qualtrics parent frame first (before any state mutation)
  sendToQualtrics(finalData);

  // 2. Lock submission. Local JSON download is disabled so data goes ONLY to
  //    Qualtrics (participants never see a file download). To re-enable the
  //    local download (e.g. for offline testing), uncomment downloadSession().
  submitted = true;
  // downloadSession();

  // 3. Update button UI to confirm submission
  const submitBtn = document.getElementById("submitSessionBtn");
  submitBtn.disabled = true;
  submitBtn.style.backgroundColor = "#4A5C50";
  submitBtn.innerHTML = "<i class='fas fa-check-circle'></i> Payment submitted";
});

document.addEventListener("DOMContentLoaded", () => {
  applyVersionUI();

  const dateFmt = { month: 'short', day: 'numeric', year: 'numeric' };

  // Payment due date (25 days out from today).
  const targetDueDateEl = document.getElementById("dynamicDueDate");
  if (targetDueDateEl) {
    const due = new Date();
    due.setDate(due.getDate() + 25);
    targetDueDateEl.textContent = due.toLocaleDateString('en-US', dateFmt);
  }

  // Statement "As of" date (statement closed ~5 days ago).
  const statementDateEl = document.getElementById("statementDate");
  if (statementDateEl) {
    const closed = new Date();
    closed.setDate(closed.getDate() - 5);
    statementDateEl.textContent = closed.toLocaleDateString('en-US', dateFmt);
  }

  // No radio is pre-selected: participants must actively enter their choice at
  // the bottom of the page. Set up the layout's messages, tabs, and slider/graph.
  applyLayoutRuntime();

  // Submit stays disabled until a payment option is chosen.
  updateSubmitState();
});

// ─── Iframe auto-resize (Qualtrics embedding) ───────────────
// When embedded, report the page height to the parent frame so Qualtrics can
// resize the iframe to fit (no clipping). Fires on load/resize and whenever the
// content changes size (layout switch, graph render, etc.).
(function reportHeightToParent() {
  function postHeight() {
    try {
      if (window.parent && window.parent !== window) {
        var h = Math.ceil(Math.max(
          document.documentElement ? document.documentElement.scrollHeight : 0,
          document.body ? document.body.scrollHeight : 0
        ));
        window.parent.postMessage({ type: "ccHeight", height: h }, "*");
      }
    } catch (e) { /* not embedded / cross-origin blocked: ignore */ }
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var run = function () { scheduled = false; postHeight(); };
    if (window.requestAnimationFrame) window.requestAnimationFrame(run);
    else window.setTimeout(run, 16);
  }

  window.addEventListener("load", schedule);
  window.addEventListener("resize", schedule);
  document.addEventListener("DOMContentLoaded", schedule);
  if (window.ResizeObserver && document.body) {
    try { new ResizeObserver(schedule).observe(document.body); } catch (e) { setInterval(postHeight, 750); }
  } else {
    setInterval(postHeight, 750); // fallback for old browsers
  }

  window.__ccPostHeight = postHeight; // exposed for manual re-posting if needed
})();