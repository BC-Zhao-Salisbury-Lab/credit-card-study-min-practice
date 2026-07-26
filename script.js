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

// The slider explores the payoff of the STATEMENT balance, so its scale runs
// 0 → statement balance (the right end is the statement balance).
const SLIDER_MAX = STATEMENT_BALANCE;

// Smallest whole-cent monthly payment that still eventually clears the statement
// balance. At or below the pure-interest point (statement × monthly rate) the
// balance never pays off, so the slider is clamped one cent above it.
const INFINITE_POINT    = STATEMENT_BALANCE * MONTHLY_RATE;          // ≈ 38.07
let   MIN_SLIDER_VALUE  = Math.ceil(INFINITE_POINT * 100) / 100;      // ≈ 38.08
if (MIN_SLIDER_VALUE <= INFINITE_POINT) MIN_SLIDER_VALUE += 0.01;    // guard exact-cent case

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
  firstCustomInputTime: null
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
  return (result || "less than a month") + ` (${totalMonths} months)`;
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
  if (!isFinite(v) || v <= 0) return "";
  if (v >= STATEMENT_BALANCE) return msgImmediate("statement", STATEMENT_BALANCE, detail);

  const m = computePayoffMetrics(v);
  if (!isFinite(m.months)) {
    return "This amount does not cover the monthly interest, so the balance would never be fully paid off.";
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
  if (!spec.choiceMsgs || !isFinite(v) || v <= 0) { el.innerHTML = ""; return; }
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

// Position the floating value bubble — ALWAYS centred over the thumb.
function positionSliderBubble(v) {
  const bubble = document.getElementById("sliderBubble");
  if (!bubble || !paymentRange) return;
  bubble.textContent = fmt(v);
  bubble.style.left = thumbLeft(v);
  bubble.style.transform = "translateX(-50%)";
}

// Place the minimum-payment notch marker exactly on the track at its value, with
// its label centred beneath. (The statement balance is now the slider's right
// end, so it no longer needs a mid-track notch.)
function positionNotches() {
  const left = thumbLeft(MIN_PAYMENT);
  const marker = document.getElementById("notchMin");
  if (marker) marker.style.left = left;
  const label = document.getElementById("notchMinLabel");
  if (label) {
    label.style.left = left;
    label.style.transform = "translateX(-50%)";
  }
}

// Jump the slider to a value (used by the clickable notches). Behaves like a
// deliberate slider stop: renders visuals and logs the choice, but — like the
// slider itself — stays unlinked from the radio selection.
function setSliderValue(v) {
  if (!paymentRange) return;
  let val = v;
  if (val < MIN_SLIDER_VALUE) val = MIN_SLIDER_VALUE;
  if (val > SLIDER_MAX)       val = SLIDER_MAX;
  paymentRange.value = String(val);
  const infMsg = document.getElementById("sliderInfiniteMsg");
  if (infMsg) infMsg.classList.remove("show");
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
  const m = computePayoffMetrics(v);
  const inf = !isFinite(m.totalPaid);
  const principal = inf ? Infinity : (m.totalPaid - m.totalInterest);
  const p = document.getElementById("principalOut");
  if (p)           p.textContent           = inf ? "Infinite" : fmt(principal);
  if (interestOut) interestOut.textContent = inf ? "Infinite" : fmt(m.totalInterest);
  if (totalOut)    totalOut.textContent    = inf ? "Infinite" : fmt(m.totalPaid);
  if (yearsOut)    yearsOut.textContent    = inf ? "Never"    : formatDurationText(m.months);
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

// Draw the graph via visualizations.js using the researcher-selected chart type
// (ACTIVE_STRATEGY). Kept swappable from the Research Control Panel — changing
// "Chart type" there redraws with the current slider value. Mirrors the original
// pipeline so all 9 chart strategies remain available.
function updateCharts(paymentAmount, animate = true) {
  if (!chartCtx) return;
  if (typeof _animateNext !== 'undefined') _animateNext = animate;
  if (typeof renderStudyChart !== 'function') return;

  const result = renderStudyChart(
    chartCtx, paymentAmount, CURRENT_BALANCE, STATEMENT_BALANCE, MONTHLY_RATE,
    computePayoffMetrics, () => { updateCharts(paymentAmount, true); }, activeChart
  );

  if (result !== activeChart) {
    if (activeChart && result === null) { activeChart.destroy(); activeChart = null; }
    else if (result !== null) { if (activeChart) activeChart.destroy(); activeChart = result; }
  }
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
    if (v < MIN_SLIDER_VALUE) { v = MIN_SLIDER_VALUE; if (paymentRange) paymentRange.value = String(v); }
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
      tracking.allChoices.push(Number((+radio.value).toFixed(2)));
    }
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
    let val = parseFloat(e.target.value);

    // Clamp: the slider visually spans to $0 but cannot be moved below the
    // point where the balance becomes un-payable. At the floor, warn the user.
    const infMsg = document.getElementById("sliderInfiniteMsg");
    if (val < MIN_SLIDER_VALUE) {
      val = MIN_SLIDER_VALUE;
      paymentRange.value = String(MIN_SLIDER_VALUE);
      if (infMsg) infMsg.classList.add("show");
    } else if (infMsg) {
      infMsg.classList.remove("show");
    }

    // First-touch timing.
    if (!tracking.usedSlider) {
      tracking.usedSlider = true;
      tracking.firstSliderUseTime = Date.now() - tracking.startTime;
    }

    // Visual-only render (bubble + message + graph). Choices untouched.
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
    let val = parseFloat(e.target.value);
    if (val < MIN_SLIDER_VALUE) val = MIN_SLIDER_VALUE;
    commitSliderChoice(val);
  });

  // Clickable minimum notch (marker + its label): jump the slider straight to
  // the minimum payment without needing to drag precisely.
  const toMin = () => setSliderValue(MIN_PAYMENT);
  ["notchMin", "notchMinLabel"].forEach(id => {
    const el = document.getElementById(id); if (el) el.addEventListener("click", toMin);
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

    if (isNaN(val) || val < 0) { updateOtherMessage(NaN); return; }
    if (val > CURRENT_BALANCE) {
      val = CURRENT_BALANCE;
      paymentInput.value = CURRENT_BALANCE.toFixed(2);
    }

    tracking.allChoices.push(Number(val.toFixed(2)));
    tracking.customAmount = Number(val.toFixed(2));
    updateOtherMessage(val);
  });

  paymentInput.addEventListener('blur', () => {
    const val = parseFloat(paymentInput.value);
    if (!isNaN(val) && val >= 0) paymentInput.value = val.toFixed(2);
    updateOtherMessage(parseFloat(paymentInput.value));
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
    startTimestamp:         new Date(tracking.startTime).toISOString(),
    endTimestamp:           new Date(tracking.endTime).toISOString()
  };
}

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

  const finalData = getSessionData();
  console.log("Transmission initialized. Final Collected Session Log Data Packet:", finalData);

  // 1. Send to Qualtrics parent frame first (before any state mutation)
  sendToQualtrics(finalData);

  // 2. Trigger local JSON download and lock submission
  downloadSession();

  // 3. Update button UI to confirm submission
  const submitBtn = document.getElementById("submitSessionBtn");
  submitBtn.disabled = true;
  submitBtn.style.backgroundColor = "#4A5C50";
  submitBtn.innerHTML = "<i class='fas fa-check-circle'></i> Session Submitted Successfully";
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
});