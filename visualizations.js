/**
 * Master Visualization Matrix
 * ACTIVE_STRATEGY controls the chart type:
 * 1 = Payment Progress Over Time          (Auto-Adapting Time-Window Tabs)
 * 2 = Fixed Timeline Comparison           (Locked 140-Month Scale)
 * 3 = Payment Strategy Comparison         (Multi-Scenario Line Chart)
 * 4 = Lifetime Cost Comparison            (Static Baseline Bar Categories)
 * 5 = Interest vs Principal Breakdown     (Donut Chart)
 * 6 = Cumulative Payment Progress         (Real Amortization Decay Curve)
 * 7 = Payment Progress (Zoomable)         (Combined Strategy 1 & 6 with Tabs)
 *
 * TAB_DISPLAY_MODE controls timeline tab visibility (Strategies 1 & 7 only):
 * 0 = Hide tabs completely
 * 1 = Show only the active tab label as static text
 * 2 = Show all tabs (full interactive display)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * These two values now live in the central CONFIG object (config.js) so they can
 * be changed from the on-screen Research Control Panel without editing code.
 * They remain ordinary variables here, initialised from CONFIG, so every chart
 * function keeps reading ACTIVE_STRATEGY / TAB_DISPLAY_MODE exactly as before.
 * When the panel changes a value it updates CONFIG, calls applyStrategyConfig()
 * to refresh these variables, then triggers a redraw. No calculation changes.
 */
let ACTIVE_STRATEGY  = (window.CONFIG && window.CONFIG.activeStrategy != null)
                         ? Number(window.CONFIG.activeStrategy) : 8;
let TAB_DISPLAY_MODE = (window.CONFIG && window.CONFIG.tabDisplayMode != null)
                         ? Number(window.CONFIG.tabDisplayMode) : 2;

// Re-read the two visualization variables from CONFIG. Called by the Research
// Control Panel after it mutates CONFIG, immediately before it requests a
// redraw. Safe to call any time; it only copies values, nothing else.
function applyStrategyConfig() {
  if (window.CONFIG) {
    if (window.CONFIG.activeStrategy != null) ACTIVE_STRATEGY  = Number(window.CONFIG.activeStrategy);
    if (window.CONFIG.tabDisplayMode != null) TAB_DISPLAY_MODE = Number(window.CONFIG.tabDisplayMode);
  }
}
window.applyStrategyConfig = applyStrategyConfig;

let selectedTimeWindowMonths = 12;
let tabsInitialized = false;
let _animateNext = true; // set false on slider drag, true on radio/init

// ─── Shared Color Tokens (colorblind-safe — IBM palette) ─────────────────────
// Orange  → interest / minimum path   (distinguishable in all major CVD types)
// Blue    → principal / user choice   (strong anchor color, universally distinct)
// Purple  → totals / pay-in-full ref  (differs from orange & blue in all CVD types)
const COLOR_INTEREST   = "#E07B00";          // Orange — always represents interest
const COLOR_PRINCIPAL  = "#0066CC";          // Blue   — always represents principal
const COLOR_TOTAL      = "#7B2FBE";          // Purple — totals / pay-in-full reference
const COLOR_MIN_PATH   = "#E07B00";          // Orange — minimum payment reference line
const COLOR_CUSTOM     = "#0066CC";          // Blue   — user's chosen path
const COLOR_OPTIMAL    = "#7B2FBE";          // Purple — pay-in-full reference line

// ─── Visualization Metadata ───────────────────────────────────────────────────
const VIZ_META = {
  1: { title: "Payment Progress Over Time",       desc: "Shows how your cumulative interest and principal payments grow month by month under your selected payment amount." },
  2: { title: "Fixed Timeline Comparison",        desc: "Compares your payment path against a fixed 140-month horizon — empty space to the right represents time saved." },
  3: { title: "Payment Strategy Comparison",      desc: "Compare the lifetime cost trajectory of your chosen payment against the minimum due and paying in full." },
  4: { title: "Lifetime Cost Comparison",         desc: "Compare the total out-of-pocket cost across three payment strategies: minimum, your choice, and full balance." },
  5: { title: "Interest vs. Principal Breakdown", desc: "See how much of your total payment goes toward interest charges versus reducing your actual balance." },
  6: { title: "Cumulative Payment Progress",      desc: "Tracks the total amount you will have paid out-of-pocket over time under different payment strategies." },
  7: { title: "Payment Progress (Zoomable)",      desc: "Shows cumulative interest and principal paid over time — use the tabs to zoom into any part of the timeline." },
  8: { title: "Lifetime Cost & Time Comparison",  desc: "Compare total out-of-pocket cost (left axis) and months to pay off (right axis) across three payment strategies." },
  9: { title: "Lifetime Total Cost Comparison",   desc: "Compare the total amount paid across three payment strategies, shown as a single bar without interest/principal breakdown." }
};

// ─── Dynamic Y-Axis Scaling ───────────────────────────────────────────────────
function computeDynamicYMax(values, headroomFactor = 0.12) {
  const max = Math.max(...values.filter(v => v !== null && isFinite(v)));
  if (!isFinite(max) || max <= 0) return 5000;
  const raw = max * (1 + headroomFactor);
  // Round up to a clean tick: nearest 500 for large values, 100 for small
  const step = raw > 2000 ? 500 : raw > 500 ? 100 : 50;
  return Math.ceil(raw / step) * step;
}

// ─── Cumulative Amortization Builder ─────────────────────────────────────────
function buildCumulativeSeries(payAmount, windowMonths, statementBalance, monthlyRate, isDynamicMin = false) {
  // Simulation runs from statement balance ($2,136.90) as the payoff target.
  // currentBalance ($2,675.11) is the total owed but charts show the statement payoff path.
  let balance     = statementBalance;
  let cumInterest = 0;
  let cumPrincipal = 0;
  const interestData  = [];
  const principalData = [];

  for (let m = 1; m <= windowMonths; m++) {
    if (balance > 0) {
      let interest        = balance * monthlyRate;
      let effectivePayment = payAmount;

      if (isDynamicMin) {
        const newBal     = balance + interest;
        effectivePayment = Math.max(20.00, newBal * 0.02);
      } else if (payAmount >= statementBalance) {
        interest         = 0;
        effectivePayment = statementBalance;
      }

      const principal = Math.min(effectivePayment - interest, balance);
      balance        -= principal;
      cumInterest    += interest;
      cumPrincipal   += principal;

      interestData.push(cumInterest);
      principalData.push(cumPrincipal);
    } else {
      interestData.push(null);
      principalData.push(null);
    }
  }

  return { interestData, principalData };
}

// ─── Tab Display Manager ──────────────────────────────────────────────────────
function setupTimeTabs() {
  const tabsContainer = document.getElementById("chartTimeTabs");
  if (!tabsContainer) return;

  const hasTabs = ACTIVE_STRATEGY === 1 || ACTIVE_STRATEGY === 7;

  if (!hasTabs || TAB_DISPLAY_MODE === 0) {
    tabsContainer.style.display = "none";
    return;
  }

  if (TAB_DISPLAY_MODE === 1) {
    // Show only the single tab that is genuinely active
    // Use the same logic as syncActiveTab: max tab only shows when window > 36
    tabsContainer.style.display = "flex";
    const maxTab = document.getElementById("maxTimelineTab");
    tabsContainer.querySelectorAll(".time-tab").forEach(t => {
      const tabMonths = parseInt(t.getAttribute("data-months"), 10);
      const isMaxTab  = t === maxTab;
      let isActive;
      if (isMaxTab) {
        isActive = tabMonths === selectedTimeWindowMonths && selectedTimeWindowMonths !== 12 && selectedTimeWindowMonths !== 36;
      } else {
        isActive = tabMonths === selectedTimeWindowMonths;
      }
      t.style.display       = isActive ? "inline-block" : "none";
      t.style.cursor        = "default";
      t.style.pointerEvents = "none";
    });
    return;
  }

  // TAB_DISPLAY_MODE === 2: show all tabs
  tabsContainer.style.display = "flex";
  tabsContainer.querySelectorAll(".time-tab").forEach(t => {
    t.style.display       = "inline-block";
    t.style.cursor        = "default";
    t.style.pointerEvents = "none";   // tabs auto-advance; no manual clicking needed
  });
}

// ─── Chart Title & Description Injector ──────────────────────────────────────
function applyVizMeta() {
  const meta = VIZ_META[ACTIVE_STRATEGY];
  if (!meta) return;

  // Title (reuse existing element, strip the badge span temporarily)
  const titleEl = document.querySelector(".chart-title");
  if (titleEl) {
    // Keep the badge span if it exists
    const badge = titleEl.querySelector("#chartPayoffBadge");
    titleEl.childNodes.forEach(n => { if (n.nodeType === Node.TEXT_NODE) n.remove(); });
    titleEl.insertAdjacentText("afterbegin", meta.title);
    if (!badge) {
      const span = document.createElement("span");
      span.id = "chartPayoffBadge";
      span.style.cssText = "margin-left:8px;color:var(--primary);font-weight:700;text-transform:none;letter-spacing:normal;";
      titleEl.appendChild(span);
    }
  }

  // Description — inject once below the title
  const chartCard = document.querySelector(".chart-card");
  if (chartCard && !chartCard.querySelector(".viz-desc")) {
    const p = document.createElement("p");
    p.className = "viz-desc";
    p.textContent = meta.desc;
    // Insert after chart-title
    const titleNode = chartCard.querySelector(".chart-title");
    if (titleNode) titleNode.insertAdjacentElement("afterend", p);
    else chartCard.prepend(p);
  }

  // Keep the injected description text in sync when the strategy changes at
  // runtime (the element is created once above, then updated here thereafter).
  const existingDesc = chartCard ? chartCard.querySelector(".viz-desc") : null;
  if (existingDesc) existingDesc.textContent = meta.desc;
}

// ─── Payoff Badge ─────────────────────────────────────────────────────────────
function updatePayoffBadgeText(displayMonths) {
  const badge = document.getElementById("chartPayoffBadge");
  if (!badge) return;

  badge.style.color = "var(--primary)";

  if (ACTIVE_STRATEGY === 5) {
    badge.innerText = ""; // desc covers it
    return;
  }
  if (ACTIVE_STRATEGY === 4) {
    badge.innerText = "";
    return;
  }
  if (!isFinite(displayMonths) || displayMonths === Infinity) {
    badge.innerText = "— ⚠️ Balance will never be paid off";
    badge.style.color = "var(--danger)";
    return;
  }
  if (displayMonths <= 1) {
    badge.innerText = "— ✓ Paid off immediately";
    badge.style.color = "var(--primary)";
    return;
  }
  badge.innerText = `— Paid off in ${displayMonths} month${displayMonths !== 1 ? "s" : ""}`;
  badge.style.color = "var(--primary)";
}

// ─── Max Tab Label Updater ────────────────────────────────────────────────────
function updateMaxTab(actualMonths) {
  const tab = document.getElementById("maxTimelineTab");
  if (!tab) return;
  const mo = isFinite(actualMonths) ? actualMonths : 140;
  tab.dataset.months = mo;
  tab.textContent = mo <= 140 ? `Max Timeline (${mo} Mo)` : `Full Timeline (${mo} Mo)`;
}

// ─── Active Tab Syncer ────────────────────────────────────────────────────────
// Matches by both value AND tab identity so the max-timeline tab is only
// highlighted when it is genuinely the selected window (displayMonths > 36),
// not just because its data-months happens to equal 12 or 36.
function syncActiveTab(windowMonths) {
  const maxTab = document.getElementById("maxTimelineTab");
  document.querySelectorAll(".time-tab").forEach(t => {
    const val = parseInt(t.getAttribute("data-months"), 10);
    const isMaxTab = t === maxTab;
    // Max tab is only active when it is the tab driving the window,
    // i.e. windowMonths is not one of the fixed breakpoints (12 or 36).
    if (isMaxTab) {
      t.classList.toggle("active", val === windowMonths && windowMonths !== 12 && windowMonths !== 36);
    } else {
      t.classList.toggle("active", val === windowMonths);
    }
  });
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────
// ─── In-Place Chart Update Helper ────────────────────────────────────────────
// Always swaps data instantly (no Chart.js per-element animation).
// On radio/init (_animateNext=true): adds a CSS class that triggers a 180ms
// opacity fade-in on the canvas, giving a clean unified transition.
// On slider drag (_animateNext=false): purely instant — no visual overhead.
function applyChartData(existingChart, ctx, type, datasets, options) {
  let chart;

  if (
    existingChart &&
    !existingChart._destroying &&
    existingChart.config.type === type &&
    existingChart.data.datasets.length === datasets.length
  ) {
    // Mutate in place
    if (options._labels) existingChart.data.labels = options._labels;
    datasets.forEach((ds, i) => {
      existingChart.data.datasets[i].data = ds.data;
      if (ds.backgroundColor !== undefined) existingChart.data.datasets[i].backgroundColor = ds.backgroundColor;
      if (ds.borderColor     !== undefined) existingChart.data.datasets[i].borderColor     = ds.borderColor;
      if (ds.pointRadius     !== undefined) existingChart.data.datasets[i].pointRadius     = ds.pointRadius;
    });
    if (options._yMax !== undefined) existingChart.options.scales.y.max = options._yMax;
    existingChart.options.animation = { duration: 0 };
    existingChart.update('none');
    chart = existingChart;
  } else {
    // Create fresh (first load or type change)
    chart = new Chart(ctx, {
      type,
      data: { labels: options._labels || [], datasets },
      options: { ...options, animation: { duration: 0 } }
    });
  }

  // CSS fade-in on intentional changes (radio / init), not on every slider tick
  if (_animateNext && ctx.canvas) {
    const canvas = ctx.canvas;
    canvas.classList.remove('chart-fade-in');
    // Force reflow so removing then re-adding the class restarts the animation
    void canvas.offsetWidth;
    canvas.classList.add('chart-fade-in');
  }

  return chart;
}

function renderStudyChart(ctx, payment, currentBalance, statementBalance, monthlyRate, computeFn, onTabChangeTrigger, existingChart = null) {
  setupTimeTabs();
  applyVizMeta();

  const metrics      = computeFn(payment);
  const displayMonths = isFinite(metrics.months) ? Math.ceil(metrics.months) : Infinity;

  updateMaxTab(displayMonths);
  updatePayoffBadgeText(displayMonths);

  if (ctx.canvas) ctx.canvas.style.width = "100%";

  // ── Infinite / unpayable state overlay ──────────────────────────────────────
  const wrapperEl  = document.getElementById("chartPositionWrapper");
  const overlayEl  = document.getElementById("chartInfiniteOverlay");
  const canvasEl   = ctx.canvas;
  // Infinite check uses statementBalance — that's the payoff target
  const isInfinite = !isFinite(displayMonths) || payment <= statementBalance * monthlyRate;

  // ── Remainder note ───────────────────────────────────────────────────────────
  // Show a persistent note that $538.21 (currentBalance - statementBalance) remains
  // after statement balance is cleared, so participants aren't confused.
  const remainder = currentBalance - statementBalance;
  const remainderNoteId = "remainderNote";
  const chartSection = document.getElementById("chartSection");
  if (chartSection && !document.getElementById(remainderNoteId)) {
    const note = document.createElement("p");
    note.id = remainderNoteId;
    note.className = "remainder-note";
    note.innerHTML = `<strong>Note:</strong> These projections show payoff of your statement balance ($${statementBalance.toFixed(2)}). ` +
      `A remaining balance of <strong>$${remainder.toFixed(2)}</strong> from recent charges will still need to be paid separately.`;
    chartSection.appendChild(note);
  }

  if (isInfinite) {
    if (wrapperEl)  wrapperEl.setAttribute("data-infinite", "true");
    if (overlayEl)  overlayEl.style.setProperty("display", "flex", "important");
    if (canvasEl)   canvasEl.style.setProperty("display", "none", "important");
    return null;
  } else {
    if (wrapperEl)  wrapperEl.removeAttribute("data-infinite");
    if (overlayEl)  overlayEl.style.setProperty("display", "none", "important");
    if (canvasEl)   canvasEl.style.setProperty("display", "block", "important");
  }

  const maxTimelineMonths = 140; // used by fixed-window strategies 2, 3, 4, 5, 6

  // ─── STRATEGY 1: Payment Progress Over Time (Auto-Adapting Tabs) ───────────
  if (ACTIVE_STRATEGY === 1) {
    let perfectWindow;
    if (displayMonths <= 12)      perfectWindow = 12;
    else if (displayMonths <= 36) perfectWindow = 36;
    else                          perfectWindow = displayMonths;

    if (perfectWindow !== selectedTimeWindowMonths) {
      selectedTimeWindowMonths = perfectWindow;
      syncActiveTab(perfectWindow);
    }

    const { interestData, principalData } = buildCumulativeSeries(
      payment, selectedTimeWindowMonths, statementBalance, monthlyRate
    );

    const allValues = [...interestData, ...principalData].filter(v => v !== null);
    const yMax = computeDynamicYMax(
      allValues.map((_, i) => (interestData[i] ?? 0) + (principalData[i] ?? 0))
    );

    const labels = Array.from({ length: selectedTimeWindowMonths }, (_, i) => `${i + 1}`);

    return applyChartData(existingChart, ctx, "bar", [
      { label: "Interest Paid",  data: interestData,  backgroundColor: COLOR_INTEREST  },
      { label: "Principal Paid", data: principalData, backgroundColor: COLOR_PRINCIPAL }
    ], {
      _labels: labels,
      _yMax: yMax,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, title: { display: true, text: "Months Since First Payment", color: "var(--text-secondary)", font: { weight: 600 } }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
        y: { stacked: true, min: 0, max: yMax, title: { display: true, text: "Total Paid ($)", color: "var(--text-secondary)", font: { weight: 600 } }, ticks: { callback: v => "$" + v.toLocaleString() } }
      },
      plugins: {
        legend: { display: true, position: "top", labels: { boxWidth: 12, padding: 14, font: { family: "'Libre Franklin', sans-serif", size: 12 } } },
        tooltip: {
          mode: "index", intersect: false, padding: 12,
          backgroundColor: "rgba(28,58,42,0.95)",
          titleFont: { size: 13, weight: 700 }, bodyFont: { size: 12 },
          callbacks: {
            title: ctx => `Month ${ctx[0].label}`,
            label: ctx => ` ${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}`,
            footer: items => `Total Paid: $${items.reduce((s,i) => s + i.parsed.y, 0).toFixed(2)}`
          }
        }
      },
      barPercentage: 0.9,
      categoryPercentage: 0.9
    });
  }

  // ─── STRATEGY 2: Fixed Timeline Comparison ────────────────────────────────
  if (ACTIVE_STRATEGY === 2) {
    const { interestData, principalData } = buildCumulativeSeries(
      payment, maxTimelineMonths, statementBalance, monthlyRate
    );

    const stackedTotals = interestData.map((v, i) =>
      (v !== null && principalData[i] !== null) ? v + principalData[i] : null
    );
    const yMax  = computeDynamicYMax(stackedTotals.filter(v => v !== null));
    const labels = Array.from({ length: maxTimelineMonths }, (_, i) => `${i + 1}`);

    return applyChartData(existingChart, ctx, "bar", [
      { label: "Interest Paid",  data: interestData,  backgroundColor: COLOR_INTEREST  },
      { label: "Principal Paid", data: principalData, backgroundColor: COLOR_PRINCIPAL }
    ], {
      _labels: labels,
      _yMax: yMax,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, title: { display: true, text: "Months Since First Payment", color: "var(--text-secondary)", font: { weight: 600 } }, ticks: { autoSkip: true, maxTicksLimit: 14 } },
        y: { stacked: true, min: 0, max: yMax, title: { display: true, text: "Total Paid ($)", color: "var(--text-secondary)", font: { weight: 600 } }, ticks: { callback: v => "$" + v.toLocaleString() } }
      },
      plugins: {
        legend: { display: true, position: "top", labels: { boxWidth: 12, padding: 14, font: { family: "'Libre Franklin', sans-serif", size: 12 } } },
        tooltip: {
          mode: "index", intersect: false, padding: 12,
          backgroundColor: "rgba(28,58,42,0.95)",
          callbacks: {
            title: ctx => `Month ${ctx[0].label}`,
            label: ctx => ` ${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}`,
            footer: items => `Total Paid: $${items.reduce((s,i)=>s+i.parsed.y,0).toFixed(2)}`
          }
        }
      },
      barPercentage: 1.0,
      categoryPercentage: 1.0
    });
  }

  // ─── STRATEGY 3: Payment Strategy Comparison (Line) ───────────────────────
  if (ACTIVE_STRATEGY === 3) {
    const labels = Array.from({ length: maxTimelineMonths }, (_, i) => `${i + 1}`);

    function buildLineTrajectory(payAmount, markPayoff = false) {
      let balance = statementBalance;
      let totalPaid = 0;
      const data    = [];
      const radii   = [];
      let marked    = false;

      for (let m = 1; m <= maxTimelineMonths; m++) {
        if (balance <= 0) {
          data.push(totalPaid);
          if (markPayoff) radii.push(0);
          continue;
        }
        const interest = payAmount >= statementBalance ? 0 : balance * monthlyRate;
        const principal = Math.min(payAmount - interest, balance);
        balance   -= principal;
        totalPaid += interest + principal;
        data.push(totalPaid);
        if (markPayoff) {
          if (balance <= 0 && !marked) { radii.push(8); marked = true; }
          else radii.push(0);
        }
      }
      return { data, radii: markPayoff ? radii : 0 };
    }

    const minLine    = buildLineTrajectory(43.00);
    const customLine = buildLineTrajectory(payment, true);
    const fullLine   = buildLineTrajectory(statementBalance);

    const yMax = computeDynamicYMax([
      ...minLine.data, ...customLine.data, ...fullLine.data
    ].filter(v => v !== null && isFinite(v)));

    return applyChartData(existingChart, ctx, "line", [
      { label: "Minimum Payment ($43/mo)",          data: minLine.data,    borderColor: COLOR_MIN_PATH, borderWidth: 2, pointRadius: 0, tension: 0.1 },
      { label: "Your Payment Choice",               data: customLine.data, borderColor: COLOR_CUSTOM,   borderWidth: 4, fill: true, backgroundColor: "rgba(0,102,204,0.07)", pointRadius: customLine.radii, pointBackgroundColor: "#FFFFFF", pointBorderColor: COLOR_CUSTOM, pointBorderWidth: 4, pointHoverRadius: 12, tension: 0.1 },
      { label: "Pay Statement Balance ($2,136.90)", data: fullLine.data,   borderColor: COLOR_TOTAL,    borderWidth: 2, borderDash: [6, 4], pointRadius: 0, tension: 0.1 }
    ], {
      _labels: labels,
      _yMax: yMax,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { title: { display: true, text: "Months Since First Payment", color: "var(--text-secondary)", font: { weight: 600 } }, ticks: { autoSkip: true, maxTicksLimit: 14 } },
        y: { min: 0, max: yMax, title: { display: true, text: "Total Paid ($)", color: "var(--text-secondary)", font: { weight: 600 } }, ticks: { callback: v => "$" + v.toLocaleString() } }
      },
      plugins: {
        legend: { display: true, position: "top", labels: { boxWidth: 14, padding: 14, font: { family: "'Libre Franklin', sans-serif", size: 12 } } },
        tooltip: {
          padding: 12, backgroundColor: "rgba(28,58,42,0.95)",
          callbacks: {
            title: ctx => `Month ${ctx[0].label}`,
            label: ctx => ` ${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}`
          }
        }
      }
    });
  }

  // ─── STRATEGY 4: Lifetime Cost Comparison (Bar — dynamic Y axis) ──────────
  if (ACTIVE_STRATEGY === 4) {
    function getLifetimeTotals(payAmount) {
      let bal = statementBalance, interest = 0, principal = 0, m = 0;
      while (bal > 0 && m < 1200) {
        m++;
        const int  = payAmount >= statementBalance ? 0 : bal * monthlyRate;
        const prin = Math.min(payAmount - int, bal);
        bal       -= prin;
        interest  += int;
        principal += prin;
      }
      return { interest, principal };
    }

    const minTotals    = getLifetimeTotals(43.00);
    const customTotals = getLifetimeTotals(payment);
    const fullTotals   = getLifetimeTotals(statementBalance);

    const yMax = computeDynamicYMax([
      minTotals.interest + minTotals.principal,
      customTotals.interest + customTotals.principal,
      fullTotals.interest + fullTotals.principal
    ]);

    return applyChartData(existingChart, ctx, "bar", [
      { label: "Interest Paid",  data: [minTotals.interest,  customTotals.interest,  fullTotals.interest],  backgroundColor: COLOR_INTEREST  },
      { label: "Principal Paid", data: [minTotals.principal, customTotals.principal, fullTotals.principal], backgroundColor: COLOR_PRINCIPAL }
    ], {
      _labels: ["Minimum Due ($43/mo)", `Your Choice ($${payment.toFixed(2)}/mo)`, "Pay Statement Balance ($2,136.90)"],
      _yMax: yMax,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, title: { display: true, text: "Payment Strategy", color: "var(--text-secondary)", font: { weight: 600 } } },
        y: { stacked: true, min: 0, max: yMax, title: { display: true, text: "Total Lifetime Cost ($)", color: "var(--text-secondary)", font: { weight: 600 } }, ticks: { callback: v => "$" + v.toLocaleString() } }
      },
      plugins: {
        legend: { display: true, position: "top", labels: { boxWidth: 12, padding: 14, font: { family: "'Libre Franklin', sans-serif", size: 12 } } },
        tooltip: {
          mode: "index", intersect: false, padding: 12,
          backgroundColor: "rgba(28,58,42,0.95)",
          callbacks: {
            title: ctx => ctx[0].label,
            label: ctx => ` ${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}`,
            footer: items => `Total Paid: $${items.reduce((s,i)=>s+i.parsed.y,0).toFixed(2)}`
          }
        }
      }
    });
  }

  // ─── STRATEGY 8: Lifetime Cost + Time (Dual Y-Axis) ─────────────────────────
  if (ACTIVE_STRATEGY === 8) {
    function getLifetimeFull(payAmount) {
      let bal = statementBalance, interest = 0, principal = 0, m = 0;
      while (bal > 0 && m < 1200) {
        m++;
        const int  = payAmount >= statementBalance ? 0 : bal * monthlyRate;
        const prin = Math.min(payAmount - int, bal);
        bal       -= prin;
        interest  += int;
        principal += prin;
      }
      return { interest, principal, months: m, total: interest + principal };
    }

    const minF    = getLifetimeFull(43.00);
    const customF = getLifetimeFull(payment);
    const fullF   = getLifetimeFull(statementBalance);

    const barLabels = ["Minimum Due ($43/mo)", `Your Choice ($${payment.toFixed(2)}/mo)`, "Pay Statement Balance ($2,136.90)"];

    const costMax  = computeDynamicYMax([minF.total, customF.total, fullF.total]);
    const monthMax = computeDynamicYMax([minF.months, customF.months, fullF.months]);

    // Dual-axis mixed charts can't be safely mutated in-place — always recreate.
    if (existingChart && !existingChart._destroying) {
      existingChart.destroy();
    }

    const chart8 = new Chart(ctx, {
      type: "bar",
      data: {
        labels: barLabels,
        datasets: [
          {
            label: "Total Cost ($)",
            data: [minF.total, customF.total, fullF.total],
            backgroundColor: [COLOR_MIN_PATH, COLOR_CUSTOM, COLOR_TOTAL],
            yAxisID: "yCost",
            order: 2
          },
          {
            label: "Months to Pay Off",
            data: [minF.months, customF.months, fullF.months],
            backgroundColor: "transparent",
            borderColor: [COLOR_MIN_PATH, COLOR_CUSTOM, COLOR_TOTAL],
            borderWidth: 2,
            type: "line",
            yAxisID: "yMonths",
            pointRadius: 6,
            pointBackgroundColor: [COLOR_MIN_PATH, COLOR_CUSTOM, COLOR_TOTAL],
            pointBorderColor: "#FFFFFF",
            pointBorderWidth: 2,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            title: { display: true, text: "Payment Strategy", color: "var(--text-secondary)", font: { weight: 600 } }
          },
          yCost: {
            type: "linear",
            position: "left",
            min: 0,
            max: costMax,
            title: { display: true, text: "Total Cost ($)", color: COLOR_INTEREST, font: { weight: 600 } },
            ticks: { color: COLOR_INTEREST, callback: v => "$" + v.toLocaleString() },
            grid: { color: "rgba(224,123,0,0.1)" }
          },
          yMonths: {
            type: "linear",
            position: "right",
            min: 0,
            max: monthMax,
            title: { display: true, text: "Months to Pay Off", color: COLOR_PRINCIPAL, font: { weight: 600 } },
            ticks: { color: COLOR_PRINCIPAL, callback: v => v + " mo" },
            grid: { drawOnChartArea: false }
          }
        },
        plugins: {
          legend: { display: true, position: "top", labels: { boxWidth: 12, padding: 14, font: { family: "'Libre Franklin', sans-serif", size: 12 } } },
          tooltip: {
            padding: 12,
            backgroundColor: "rgba(28,58,42,0.95)",
            callbacks: {
              title: ctx => ctx[0].label,
              label: ctx => {
                if (ctx.dataset.yAxisID === "yCost")    return ` Total Cost: $${ctx.parsed.y.toFixed(2)}`;
                if (ctx.dataset.yAxisID === "yMonths")  return ` Months to Pay Off: ${ctx.parsed.y}`;
                return ctx.dataset.label + ": " + ctx.parsed.y;
              }
            }
          }
        }
      }
    });
    return chart8;
  }

  // ─── STRATEGY 9: Lifetime Total Cost (No Interest/Principal Split) ────────
  if (ACTIVE_STRATEGY === 9) {
    function getLifetimeTotal(payAmount) {
      let bal = statementBalance, total = 0, m = 0;
      while (bal > 0 && m < 1200) {
        m++;
        const int  = payAmount >= statementBalance ? 0 : bal * monthlyRate;
        const prin = Math.min(payAmount - int, bal);
        bal   -= prin;
        total += int + prin;
      }
      return total;
    }

    const minTotal    = getLifetimeTotal(43.00);
    const customTotal = getLifetimeTotal(payment);
    const fullTotal   = getLifetimeTotal(statementBalance);

    const yMax9 = computeDynamicYMax([minTotal, customTotal, fullTotal]);

    return applyChartData(existingChart, ctx, "bar", [
      {
        label: "Total Amount Paid",
        data: [minTotal, customTotal, fullTotal],
        backgroundColor: [COLOR_MIN_PATH, COLOR_CUSTOM, COLOR_TOTAL]
      }
    ], {
      _labels: ["Minimum Due ($43/mo)", `Your Choice ($${payment.toFixed(2)}/mo)`, "Pay Statement Balance ($2,136.90)"],
      _yMax: yMax9,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "Payment Strategy", color: "var(--text-secondary)", font: { weight: 600 } } },
        y: {
          min: 0,
          max: yMax9,
          title: { display: true, text: "Total Amount Paid ($)", color: "var(--text-secondary)", font: { weight: 600 } },
          ticks: { callback: v => "$" + v.toLocaleString() }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          padding: 12,
          backgroundColor: "rgba(28,58,42,0.95)",
          callbacks: {
            title: ctx => ctx[0].label,
            label: ctx => ` Total Paid: $${ctx.parsed.y.toFixed(2)}`
          }
        }
      }
    });
  }

  // ─── STRATEGY 5: Interest vs. Principal Breakdown (Donut) ─────────────────
  if (ACTIVE_STRATEGY === 5) {
    let totalInterest = 0;

    if (payment < statementBalance) {
      let bal = statementBalance;
      const loops = isFinite(metrics.months) ? Math.ceil(metrics.months) : maxTimelineMonths;
      for (let m = 1; m <= loops; m++) {
        if (bal <= 0) break;
        const interest = bal * monthlyRate;
        const principal = Math.min(payment - interest, bal);
        bal -= principal;
        totalInterest += interest;
      }
    }

    const paidInFull = totalInterest <= 0.01;
    const chartData   = paidInFull
      ? [statementBalance]
      : [statementBalance, totalInterest];
    const chartColors = paidInFull
      ? [COLOR_PRINCIPAL]
      : [COLOR_PRINCIPAL, COLOR_INTEREST];
    const chartLabels = paidInFull
      ? ["Statement Balance (Paid In Full)"]
      : ["Statement Balance", "Total Interest Paid"];

    return applyChartData(existingChart, ctx, "doughnut", [{
      data: chartData,
      backgroundColor: chartColors,
      borderWidth: paidInFull ? 0 : 2,
      hoverOffset: paidInFull ? 0 : 4
    }], {
      _labels: chartLabels,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: "top", labels: { boxWidth: 14, padding: 14, font: { family: "'Libre Franklin', sans-serif", size: 12 } } },
        tooltip: {
          padding: 12, backgroundColor: "rgba(28,58,42,0.95)",
          callbacks: { label: ctx => ` ${ctx.label}: $${ctx.parsed.toFixed(2)}` }
        }
      }
    });
  }

  // ─── STRATEGY 6: Cumulative Payment Progress (Decay Curve) ────────────────
  if (ACTIVE_STRATEGY === 6) {
    const labels = Array.from({ length: maxTimelineMonths }, (_, i) => `${i + 1}`);

    function buildDecayLine(payAmount, markPayoff = false, isDynamicMin = false) {
      let bal = statementBalance, totalPaid = 0;
      const monthlyRaw = [];
      let m = 0;

      while (bal > 0 && m < 1200) {
        m++;
        let interest = bal * monthlyRate;
        let eff = payAmount;

        if (isDynamicMin) {
          eff = Math.max(20.00, (bal + interest) * 0.02);
        } else if (payAmount >= statementBalance) {
          interest = 0; eff = statementBalance;
        }

        const principal = Math.min(eff - interest, bal);
        bal       -= principal;
        totalPaid += interest + principal;
        monthlyRaw.push({ totalPaid, done: bal <= 0 });
      }

      const data   = [];
      const radii  = [];
      let marked   = false;

      for (let i = 1; i <= maxTimelineMonths; i++) {
        if (i <= monthlyRaw.length) {
          const rec = monthlyRaw[i - 1];
          data.push(rec.totalPaid);
          if (markPayoff) {
            if (rec.done && !marked) { radii.push(7); marked = true; }
            else radii.push(0);
          }
        } else {
          const last = monthlyRaw[monthlyRaw.length - 1];
          data.push(last ? last.totalPaid : totalPaid);
          if (markPayoff) radii.push(0);
        }
      }

      return { data, radii: markPayoff ? radii : 0 };
    }

    const minLine    = buildDecayLine(43.00);
    const customLine = buildDecayLine(payment, true);
    const fullLine   = buildDecayLine(statementBalance);

    const yMax = computeDynamicYMax([...minLine.data, ...customLine.data, ...fullLine.data].filter(v => isFinite(v)));

    return applyChartData(existingChart, ctx, "line", [
      { label: "Minimum Payment ($43/mo Fixed)",    data: minLine.data,    borderColor: COLOR_MIN_PATH, borderWidth: 2, pointRadius: 0, tension: 0.15 },
      { label: "Your Payment Choice",               data: customLine.data, borderColor: COLOR_CUSTOM,   borderWidth: 4, fill: true, backgroundColor: "rgba(0,102,204,0.07)", pointRadius: customLine.radii, pointBackgroundColor: COLOR_CUSTOM, pointBorderColor: "#FFFFFF", pointBorderWidth: 2, pointHoverRadius: 10, tension: 0.05 },
      { label: "Pay Statement Balance ($2,136.90)", data: fullLine.data,   borderColor: COLOR_TOTAL,    borderWidth: 1.5, borderDash: [5,5], pointRadius: 0, tension: 0.05 }
    ], {
      _labels: labels,
      _yMax: yMax,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { title: { display: true, text: "Months Since First Payment", color: "var(--text-secondary)", font: { weight: 600 } }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
        y: { min: 0, max: yMax, title: { display: true, text: "Total Paid ($)", color: "var(--text-secondary)", font: { weight: 600 } }, ticks: { callback: v => "$" + v.toLocaleString() } }
      },
      plugins: {
        legend: { display: true, position: "top", labels: { boxWidth: 12, padding: 14, font: { size: 11.5, family: "'Libre Franklin', sans-serif" } } },
        tooltip: {
          padding: 12, backgroundColor: "rgba(28,58,42,0.95)",
          titleFont: { size: 13, weight: 700 }, bodyFont: { size: 12 },
          callbacks: {
            title: ctx => `Month ${ctx[0].label}`,
            label: ctx => ` ${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}`
          }
        }
      }
    });
  }

  // ─── STRATEGY 7: Payment Progress (Zoomable Tabs) ─────────────────────────
  if (ACTIVE_STRATEGY === 7) {
    let perfectWindow;
    if (displayMonths <= 12)      perfectWindow = 12;
    else if (displayMonths <= 36) perfectWindow = 36;
    else                          perfectWindow = displayMonths;

    if (perfectWindow !== selectedTimeWindowMonths) {
      selectedTimeWindowMonths = perfectWindow;
      syncActiveTab(perfectWindow);
    }

    const { interestData, principalData } = buildCumulativeSeries(
      payment, selectedTimeWindowMonths, statementBalance, monthlyRate
    );

    const stackedTotals = interestData.map((v, i) =>
      (v !== null && principalData[i] !== null) ? v + principalData[i] : null
    );
    const yMax  = computeDynamicYMax(stackedTotals.filter(v => v !== null));
    const labels = Array.from({ length: selectedTimeWindowMonths }, (_, i) => `${i + 1}`);

    return applyChartData(existingChart, ctx, "bar", [
      { label: "Interest Paid",  data: interestData,  backgroundColor: COLOR_INTEREST  },
      { label: "Principal Paid", data: principalData, backgroundColor: COLOR_PRINCIPAL }
    ], {
      _labels: labels,
      _yMax: yMax,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { stacked: true, title: { display: true, text: "Months Since First Payment", color: "var(--text-secondary)", font: { weight: 600 } }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
        y: { stacked: true, min: 0, max: yMax, title: { display: true, text: "Total Paid ($)", color: "var(--text-secondary)", font: { weight: 600 } }, ticks: { callback: v => "$" + v.toLocaleString() } }
      },
      plugins: {
        legend: { display: true, position: "top", labels: { boxWidth: 12, padding: 14, font: { family: "'Libre Franklin', sans-serif", size: 12 } } },
        tooltip: {
          mode: "index", intersect: false, padding: 12,
          backgroundColor: "rgba(28,58,42,0.95)",
          titleFont: { size: 13, weight: 700 }, bodyFont: { size: 12 },
          callbacks: {
            title: ctx => `Month ${ctx[0].label}`,
            label: ctx => ` ${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}`,
            footer: items => `Total Paid: $${items.reduce((s,i)=>s+i.parsed.y,0).toFixed(2)}`
          }
        }
      },
      barPercentage: 0.85,
      categoryPercentage: 0.85
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  FINALIZED-SURVEY COMPARISON GRAPH  (layouts 6 & 7)
 *  A bar chart comparing three payment strategies — Minimum, the participant's
 *  slider "Your Choice", and Pay in Full — for one metric at a time. The metric
 *  is chosen by the tabs above the graph:
 *      layout 6 → total, payoff time
 *      layout 7 → principal, interest, total, payoff time
 *  It is driven only by the slider (decoupled from the choice radios) and never
 *  enters an infinite state (the slider is clamped above the un-payable point).
 * ═══════════════════════════════════════════════════════════════════════════ */
window.renderLayoutGraph = function renderLayoutGraph(ctx, payment, currentBalance, statementBalance, monthlyRate, metric, existingChart) {
  if (!ctx) return existingChart || null;

  function lifetime(payAmount) {
    let bal = statementBalance, interest = 0, principal = 0, m = 0;
    while (bal > 0 && m < 1200) {
      m++;
      const int  = payAmount >= statementBalance ? 0 : bal * monthlyRate;
      const prin = Math.min(payAmount - int, bal);
      bal       -= prin;
      interest  += int;
      principal += prin;
    }
    return { interest, principal, months: m, total: interest + principal };
  }

  const minF    = lifetime(43.00);
  const youF    = lifetime(payment);
  const fullF   = lifetime(statementBalance);

  const labels = ["Minimum ($43/mo)", `Your Choice ($${payment.toFixed(2)}/mo)`, "Pay in Full ($2,136.90)"];
  const colors = [COLOR_MIN_PATH, COLOR_CUSTOM, COLOR_TOTAL];

  const METRICS = {
    total:     { pick: f => f.total,     axis: "Total Amount Paid ($)", isMoney: true,  name: "Total Paid" },
    principal: { pick: f => f.principal, axis: "Principal Paid ($)",    isMoney: true,  name: "Principal" },
    interest:  { pick: f => f.interest,  axis: "Interest Paid ($)",     isMoney: true,  name: "Interest" },
    time:      { pick: f => f.months,    axis: "Months to Pay Off",     isMoney: false, name: "Months to Pay Off" }
  };
  const spec = METRICS[metric] || METRICS.total;
  const data = [spec.pick(minF), spec.pick(youF), spec.pick(fullF)];
  const yMax = computeDynamicYMax(data);

  // Payoff badge → the participant's current slider choice.
  const badge = document.getElementById("chartPayoffBadge");
  if (badge) {
    badge.style.color = "var(--primary)";
    badge.innerText = youF.months <= 1
      ? "— Your choice pays off immediately"
      : `— Your choice pays off in ${youF.months} months`;
  }

  const tickFmt = spec.isMoney
    ? (v => "$" + v.toLocaleString())
    : (v => v + " mo");

  // Update in place when the metric (and thus axis format) is unchanged;
  // otherwise rebuild so axis titles / tick formatting refresh cleanly.
  if (existingChart && !existingChart._destroying &&
      existingChart.config.type === "bar" && existingChart._metric === metric) {
    existingChart.data.labels = labels;
    existingChart.data.datasets[0].data = data;
    existingChart.data.datasets[0].backgroundColor = colors;
    existingChart.options.scales.y.max = yMax;
    existingChart.options.animation = { duration: 0 };
    existingChart.update('none');
    if (_animateNext && ctx.canvas) {
      ctx.canvas.classList.remove('chart-fade-in');
      void ctx.canvas.offsetWidth;
      ctx.canvas.classList.add('chart-fade-in');
    }
    return existingChart;
  }

  if (existingChart) { try { existingChart.destroy(); } catch (e) {} }

  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: spec.name, data, backgroundColor: colors }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      scales: {
        x: { title: { display: true, text: "Payment Strategy", color: "var(--text-secondary)", font: { weight: 600 } } },
        y: {
          min: 0, max: yMax,
          title: { display: true, text: spec.axis, color: "var(--text-secondary)", font: { weight: 600 } },
          ticks: { callback: tickFmt }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          padding: 12, backgroundColor: "rgba(28,58,42,0.95)",
          callbacks: {
            title: c => c[0].label,
            label: c => spec.isMoney ? ` ${spec.name}: $${c.parsed.y.toFixed(2)}` : ` ${spec.name}: ${c.parsed.y}`
          }
        }
      }
    }
  });
  chart._metric = metric;
  if (_animateNext && ctx.canvas) {
    ctx.canvas.classList.remove('chart-fade-in');
    void ctx.canvas.offsetWidth;
    ctx.canvas.classList.add('chart-fade-in');
  }
  return chart;
};