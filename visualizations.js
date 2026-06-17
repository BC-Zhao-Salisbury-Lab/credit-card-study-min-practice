/**
 * Master High-Readability Visualization Matrix
 * Switch ACTIVE_STRATEGY to change the layout style:
 * 1 = Auto-Adapting Time-Window Tabs (Seamless Tab Shifting & Zero-Scroll)
 * 2 = Fixed Horizon Timeline (Locked Scales - Empty space shows savings)
 * 3 = Multi-Scenario Comparison (Line Chart - Custom vs. Min Path with Target Anchor Node)
 * 4 = Static Baseline Categories (3 Pillars - Total Lifetime Cost Comparison)
 * 5 = Interest Bleed Breakdown (Pie/Donut Matrix - Highlighting Financial Waste)
 * 6 = Real Amortization Decay Curve (Dynamic Minimum Sizing & Crosshair Tracker)
 * 7 = Dynamic Amortization Bars with Zoom Tabs (Combined Strategy 1 & 6)
 */
const ACTIVE_STRATEGY = 7; 

let selectedTimeWindowMonths = 12; 
let tabsInitialized = false;

function setupTimeTabs(onTabChangeCallback) {
  const tabsContainer = document.getElementById("chartTimeTabs");
  if (!tabsContainer) return;

  // Display tab selectors only for timeline slice views (Strategy 1 & 7)
  if (ACTIVE_STRATEGY === 1 || ACTIVE_STRATEGY === 7) {
    tabsContainer.style.display = "flex"; 
  } else {
    tabsContainer.style.display = "none";
    return;
  }

  if (tabsInitialized) return; 
  tabsInitialized = true;

  const tabs = tabsContainer.querySelectorAll(".time-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", (e) => {
      tabs.forEach(t => t.classList.remove("active"));
      e.target.classList.add("active");
      selectedTimeWindowMonths = parseInt(e.target.getAttribute("data-months"), 10);
      onTabChangeCallback(); 
    });
  });
}

function updatePayoffBadgeText(totalMonths) {
  const badge = document.getElementById("chartPayoffBadge");
  if (!badge) return;

  badge.style.color = "var(--primary)";

  if (ACTIVE_STRATEGY === 5) {
    badge.innerText = "— Pure Interest Waste vs. Spent Principal";
    badge.style.color = "var(--danger)";
    return;
  }
  if (ACTIVE_STRATEGY === 4) {
    badge.innerText = "— Lifetime Cost Outcomes Summary";
    return;
  }
  if (ACTIVE_STRATEGY === 6 || ACTIVE_STRATEGY === 7) {
    if (!isFinite(totalMonths) || totalMonths === Infinity) {
      badge.innerText = "— ⚠️ Custom Payment Too Low to Clear Monthly Interest Bleed";
      badge.style.color = "#9B3232";
    } else {
      badge.innerText = `— 🎉 Custom Recalculating Path Pays Off in ${totalMonths} Month${totalMonths > 1 ? 's' : ''}`;
    }
    return;
  }

  if (!isFinite(totalMonths) || totalMonths === Infinity) {
    badge.innerText = "— ⚠️ WARNING: Debt Will Never Be Paid Off";
    badge.style.color = "var(--danger)";
  } else if (totalMonths <= 1) {
    badge.innerText = "— 🎉 Debt Cleared Immediately!";
  } else if (totalMonths <= 140) {
    badge.innerText = `— 🎉 Debt Cleared in Month ${totalMonths}!`;
  } else {
    badge.innerText = "— ⚠️ Takes over 140 months to clear";
    badge.style.color = "var(--warning)";
  }
}

function renderStudyChart(ctx, payment, currentBalance, monthlyRate, computeFn, onTabChangeTrigger) {
  setupTimeTabs(onTabChangeTrigger);

  const metrics = computeFn(payment);
  const maxTimelineMonths = 140; 
  const maxLifetimeCost = 4500;  

  const displayMonths = isFinite(metrics.months) ? Math.ceil(metrics.months) : Infinity;
  updatePayoffBadgeText(displayMonths);

  if (ctx.canvas) {
    ctx.canvas.style.width = "100%";
  }

  const wrapperElement = document.getElementById("chartPositionWrapper");
  const overlay = document.getElementById("chartInfiniteOverlay");
  const canvasElement = ctx.canvas;

  // Global Check for Infinite/Unpayable States across Timeline Layouts
  const interestChargeThreshold = currentBalance * monthlyRate;
  const isInfinite = displayMonths === Infinity || !isFinite(displayMonths) || payment <= interestChargeThreshold;

  if (isInfinite && (ACTIVE_STRATEGY === 1 || ACTIVE_STRATEGY === 2 || ACTIVE_STRATEGY === 6 || ACTIVE_STRATEGY === 7)) {
    if (wrapperElement) wrapperElement.setAttribute("data-infinite", "true");
    if (overlay) overlay.style.setProperty('display', 'flex', 'important');
    if (canvasElement) canvasElement.style.setProperty('display', 'none', 'important');
    return null; 
  } else {
    if (wrapperElement) wrapperElement.removeAttribute("data-infinite");
    if (overlay) overlay.style.setProperty('display', 'none', 'important');
    if (canvasElement) canvasElement.style.setProperty('display', 'block', 'important');
  }

  // ─── STRATEGY 1: TIME-WINDOW ZOOM TABS ────────────
  if (ACTIVE_STRATEGY === 1) {
    let perfectWindow = selectedTimeWindowMonths;
    if (displayMonths <= 12) perfectWindow = 12;
    else if (displayMonths <= 36) perfectWindow = 36;
    else perfectWindow = 140;

    if (perfectWindow !== selectedTimeWindowMonths) {
      selectedTimeWindowMonths = perfectWindow;
      const tabs = document.querySelectorAll(".time-tab");
      tabs.forEach(t => {
        if (parseInt(t.getAttribute("data-months"), 10) === perfectWindow) t.classList.add("active");
        else t.classList.remove("active");
      });
    }

    const labels = Array.from({ length: selectedTimeWindowMonths }, (_, i) => `${i + 1}`);
    let balance = currentBalance;
    let totalInterestSoFar = 0;
    let totalPrincipalSoFar = 0;
    const cumulativeInterest = [];
    const cumulativePrincipal = [];

    for (let m = 1; m <= selectedTimeWindowMonths; m++) {
      if (m <= displayMonths && balance > 0) {
        // Fix: Apply standard grace period for full statement payments
        const interest = payment >= currentBalance ? 0 : balance * monthlyRate;
        const principal = Math.min(payment - interest, balance);
        balance -= principal;
        totalInterestSoFar += interest;
        totalPrincipalSoFar += principal;
        cumulativeInterest.push(totalInterestSoFar);
        cumulativePrincipal.push(totalPrincipalSoFar);
      } else {
        cumulativeInterest.push(null);
        cumulativePrincipal.push(null);
      }
    }

    return new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Cumulative Interest Paid", data: cumulativeInterest, backgroundColor: "#9B3232" },
          { label: "Cumulative Principal Paid", data: cumulativePrincipal, backgroundColor: "#2E6B4F" }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 }, 
        scales: {
          x: { stacked: true, title: { display: true, text: 'Month' }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
          y: { stacked: true, min: 0, max: maxLifetimeCost, title: { display: true, text: 'Total Amount Paid ($)' }, ticks: { callback: v => '$' + v.toFixed(0) } }
        },
        barPercentage: 0.9,
        categoryPercentage: 0.9
      }
    });
  }

  // ─── STRATEGY 2: FIXED HORIZON TIMELINE ───────────
  if (ACTIVE_STRATEGY === 2) {
    const labels = Array.from({ length: maxTimelineMonths }, (_, i) => `${i + 1}`);
    let balance = currentBalance;
    let totalInterestSoFar = 0;
    let totalPrincipalSoFar = 0;
    const cumulativeInterest = [];
    const cumulativePrincipal = [];

    for (let m = 1; m <= maxTimelineMonths; m++) {
      if (m <= displayMonths && balance > 0) {
        // Fix: Apply standard grace period for full statement payments
        const interest = payment >= currentBalance ? 0 : balance * monthlyRate;
        const principal = Math.min(payment - interest, balance);
        balance -= principal;
        totalInterestSoFar += interest;
        totalPrincipalSoFar += principal;
        cumulativeInterest.push(totalInterestSoFar);
        cumulativePrincipal.push(totalPrincipalSoFar);
      } else {
        cumulativeInterest.push(null);
        cumulativePrincipal.push(null);
      }
    }

    return new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Cumulative Interest Paid", data: cumulativeInterest, backgroundColor: "#9B3232" },
          { label: "Cumulative Principal Paid", data: cumulativePrincipal, backgroundColor: "#2E6B4F" }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, title: { display: true, text: 'Month' }, ticks: { autoSkip: true, maxTicksLimit: 14 } },
          y: { stacked: true, min: 0, max: maxLifetimeCost, title: { display: true, text: 'Total Amount Paid ($)' }, ticks: { callback: v => '$' + v.toFixed(0) } }
        },
        barPercentage: 1.0,
        categoryPercentage: 1.0
      }
    });
  }

  // ─── STRATEGY 3: MULTI-SCENARIO COMPARISON ─────────
  if (ACTIVE_STRATEGY === 3) {
    const labels = Array.from({ length: maxTimelineMonths }, (_, i) => `${i + 1}`);

    function generateLineTrajectory(payAmount, isCustomChoice = false) {
      let balance = currentBalance;
      let totalPaid = 0;
      const dataPoints = [];
      let foundPayoffMonth = false;
      const pointRadiusArray = [];

      for (let m = 1; m <= maxTimelineMonths; m++) {
        if (balance <= 0) {
          dataPoints.push(totalPaid);
          if (isCustomChoice) pointRadiusArray.push(0);
          continue;
        }

        // Fix: Apply standard grace period for full statement payments
        const interest = payAmount >= currentBalance ? 0 : balance * monthlyRate;
        const principal = Math.min(payAmount - interest, balance);
        balance -= principal;
        totalPaid += (interest + principal);
        dataPoints.push(totalPaid);

        if (isCustomChoice) {
          if (balance <= 0 && !foundPayoffMonth) {
            pointRadiusArray.push(8); 
            foundPayoffMonth = true;
          } else {
            pointRadiusArray.push(0); 
          }
        }
      }

      return { data: dataPoints, radii: isCustomChoice ? pointRadiusArray : 0 };
    }

    const minTrajectory = generateLineTrajectory(38.00, false);
    const customTrajectory = generateLineTrajectory(payment, true);
    const optimalTrajectory = generateLineTrajectory(currentBalance, false);

    return new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Minimum Payment Path ($38/mo)", data: minTrajectory.data, borderColor: "#9B3232", borderWidth: 2, pointRadius: 0 },
          { 
            label: "Your Custom Choice Path", 
            data: customTrajectory.data, 
            borderColor: "#2E6B4F", 
            borderWidth: 4, 
            fill: true, 
            backgroundColor: "rgba(46,107,79,0.06)", 
            pointRadius: customTrajectory.radii, 
            pointBackgroundColor: "#FFFFFF",      
            pointBorderColor: "#2E6B4F",          
            pointBorderWidth: 4,                  
            pointHoverRadius: 12,                 
            pointHoverBackgroundColor: "#2E6B4F"
          },
          { label: "Pay in Full Immediately ($1,875.11)", data: optimalTrajectory.data, borderColor: "#2B5C8F", borderWidth: 2, borderDash: [6, 4], pointRadius: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: 'Months' }, ticks: { autoSkip: true, maxTicksLimit: 14 } },
          y: { min: 0, max: maxLifetimeCost, title: { display: true, text: 'Total Out of Pocket ($)' }, ticks: { callback: v => '$' + v.toFixed(0) } }
        },
        plugins: {
          legend: { display: true, position: 'top', labels: { boxWidth: 20, font: { size: 11 } } }
        }
      }
    });
  }

  // ─── STRATEGY 4: STATIC BASELINE CATEGORIES ───────
  if (ACTIVE_STRATEGY === 4) {
    function getFinalMetrics(payAmount) {
      let balance = currentBalance;
      let totalInterest = 0;
      let totalPrincipal = 0;
      const sim = computeFn(payAmount);
      const loops = isFinite(sim.months) ? Math.ceil(sim.months) : maxTimelineMonths;
      for (let m = 1; m <= loops; m++) {
        if (balance <= 0) break;
        // Fix: Apply standard grace period for full statement payments
        const interest = payAmount >= currentBalance ? 0 : balance * monthlyRate;
        const principal = Math.min(payAmount - interest, balance);
        balance -= principal;
        totalInterest += interest;
        totalPrincipal += principal;
      }
      return { interest: totalInterest, principal: totalPrincipal };
    }

    const minOption = getFinalMetrics(38.00);
    const userOption = getFinalMetrics(payment);
    const fullOption = getFinalMetrics(currentBalance);

    const dynamicCustomLabel = `Your Choice ($${payment.toFixed(2)}/mo)`;

    return new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Minimum Due ($38)", dynamicCustomLabel, "Full Balance ($1,875.11)"],
        datasets: [
          { label: "Total Interest Paid", data: [minOption.interest, userOption.interest, fullOption.interest], backgroundColor: "#9B3232" },
          { label: "Total Principal Paid", data: [minOption.principal, userOption.principal, fullOption.principal], backgroundColor: "#2E6B4F" }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: { stacked: true, min: 0, max: maxLifetimeCost, title: { display: true, text: "Total Lifetime Cost ($)" } }
        }
      }
    });
  }

  // ─── STRATEGY 5: INTEREST BLEED BREAKDOWN ──────
  if (ACTIVE_STRATEGY === 5) {
    let totalInterest = 0;

    if (payment >= currentBalance) {
      totalInterest = 0;
    } else {
      let balance = currentBalance;
      const loops = isFinite(metrics.months) ? Math.ceil(metrics.months) : maxTimelineMonths;

      for (let m = 1; m <= loops; m++) {
        if (balance <= 0) break;
        const interest = balance * monthlyRate;
        const principal = Math.min(payment - interest, balance);
        balance -= principal;
        totalInterest += interest;
      }
    }

    let chartDataValues, chartBackgroundColors, chartLabels;

    if (totalInterest <= 0.01) {
      chartDataValues = [currentBalance];
      chartBackgroundColors = ["#2E6B4F"];
      chartLabels = ["Principal Balance (Paid In Full)"];
    } else {
      chartDataValues = [currentBalance, totalInterest];
      chartBackgroundColors = ["#2E6B4F", "#9B3232"];
      chartLabels = ["Principal Balance (Spent)", "Interest Bleed (Waste)"];
    }

    return new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: chartLabels,
        datasets: [{
          data: chartDataValues,
          backgroundColor: chartBackgroundColors,
          borderWidth: totalInterest <= 0.01 ? 0 : 2,
          hoverOffset: totalInterest <= 0.01 ? 0 : 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        aspectRatio: 2,
        plugins: {
          legend: {
            position: 'top',
            labels: { padding: 15 }
          }
        }
      }
    });
  }

  // ─── STRATEGY 6: REAL DECAY CURVE (RECALCULATING MINIMUM CLEARLY LABELED) ───────────
  if (ACTIVE_STRATEGY === 6) {
    const labels = Array.from({ length: maxTimelineMonths }, (_, i) => `${i + 1}`);

    function generateAmortizationLine(payAmount, isCustomChoice = false, isDynamicMinimum = false) {
      let balance = currentBalance;
      let totalPaid = 0;
      const dataPoints = [];
      let foundPayoffMonth = false;
      const pointRadiusArray = [];

      for (let m = 1; m <= maxTimelineMonths; m++) {
        if (balance <= 0) {
          dataPoints.push(totalPaid);
          if (isCustomChoice) pointRadiusArray.push(0);
          continue;
        }

        let effectivePayment = payAmount;
        // Fix: Apply standard grace period for full statement payments
        let interest = payAmount >= currentBalance ? 0 : balance * monthlyRate;

        if (isDynamicMinimum) {
          interest = balance * monthlyRate;
          const percentageMin = (balance * 0.01) + interest;
          effectivePayment = Math.max(38.00, percentageMin);
        }

        const principal = Math.min(effectivePayment - interest, balance);
        balance -= principal;
        totalPaid += (interest + principal);
        dataPoints.push(totalPaid);

        if (isCustomChoice) {
          if (balance <= 0 && !foundPayoffMonth) {
            pointRadiusArray.push(7); 
            foundPayoffMonth = true;
          } else {
            pointRadiusArray.push(0); 
          }
        }
      }

      return { data: dataPoints, radii: isCustomChoice ? pointRadiusArray : 0 };
    }

    const minTrajectory = generateAmortizationLine(38.00, false, true); 
    const customTrajectory = generateAmortizationLine(payment, true, false);
    const optimalTrajectory = generateAmortizationLine(currentBalance, false, false);

    return new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Recalculating Minimum Payment Curve (Declines Monthly)", data: minTrajectory.data, borderColor: "#9B3232", borderWidth: 2, pointRadius: 0, tension: 0.15 },
          { 
            label: "Your Fixed Custom Choice Path", 
            data: customTrajectory.data, 
            borderColor: "#2E6B4F", 
            borderWidth: 4, 
            fill: true, 
            backgroundColor: "rgba(46,107,79,0.04)", 
            pointRadius: customTrajectory.radii, 
            pointBackgroundColor: "#2E6B4F",      
            pointBorderColor: "#FFFFFF",          
            pointBorderWidth: 2,                  
            pointHoverRadius: 10,                 
            pointHoverBackgroundColor: "#1C3A2A",
            tension: 0.05
          },
          { label: "Pay Statement Balance in Full", data: optimalTrajectory.data, borderColor: "#4A5C40", borderWidth: 1.5, borderDash: [5, 5], pointRadius: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { title: { display: true, text: 'Months Out into Future', color: 'var(--text-secondary)', font: { weight: 600 } }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
          y: { min: 0, max: maxLifetimeCost, title: { display: true, text: 'Cumulative Out-of-Pocket Cost ($)', color: 'var(--text-secondary)', font: { weight: 600 } }, ticks: { callback: v => '$' + v.toLocaleString() } }
        },
        plugins: {
          legend: { display: true, position: 'top', labels: { boxWidth: 12, padding: 12, font: { size: 11.5, family: "'Libre Franklin', sans-serif" } } },
          tooltip: {
            padding: 12,
            backgroundColor: 'rgba(28, 58, 42, 0.95)',
            titleFont: { size: 13, weight: 700 },
            bodyFont: { size: 12 },
            callbacks: {
              title: function(context) { return `Milestone: Month ${context[0].label}`; },
              label: function(context) { return ` ${context.dataset.label}: $${context.parsed.y.toFixed(2)}`; }
            }
          }
        }
      }
    });
  }

  // ─── STRATEGY 7: DYNAMIC CC AMORTIZATION BARS WITH TIME WINDOW TABS ─────
  if (ACTIVE_STRATEGY === 7) {
    let perfectWindow = selectedTimeWindowMonths;
    if (displayMonths <= 12) perfectWindow = 12;
    else if (displayMonths <= 36) perfectWindow = 36;
    else perfectWindow = 140;

    if (perfectWindow !== selectedTimeWindowMonths) {
      selectedTimeWindowMonths = perfectWindow;
      const tabs = document.querySelectorAll(".time-tab");
      tabs.forEach(t => {
        if (parseInt(t.getAttribute("data-months"), 10) === perfectWindow) t.classList.add("active");
        else t.classList.remove("active");
      });
    }

    const labels = Array.from({ length: selectedTimeWindowMonths }, (_, i) => `${i + 1}`);
    let balance = currentBalance;
    let totalInterestSoFar = 0;
    let totalPrincipalSoFar = 0;
    const cumulativeInterest = [];
    const cumulativePrincipal = [];

    for (let m = 1; m <= selectedTimeWindowMonths; m++) {
      if (balance > 0) {
        // Fix: Apply standard grace period for full statement payments
        const interest = payment >= currentBalance ? 0 : balance * monthlyRate;
        const principal = Math.min(payment - interest, balance);
        balance -= principal;
        
        totalInterestSoFar += interest;
        totalPrincipalSoFar += principal;
        
        cumulativeInterest.push(totalInterestSoFar);
        cumulativePrincipal.push(totalPrincipalSoFar);
      } else {
        cumulativeInterest.push(null);
        cumulativePrincipal.push(null);
      }
    }

    return new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Cumulative Interest Accrued", data: cumulativeInterest, backgroundColor: "#9B3232" },
          { label: "Cumulative Principal Reduced (Fixed Custom Path)", data: cumulativePrincipal, backgroundColor: "#2E6B4F" }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 }, 
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { stacked: true, title: { display: true, text: 'Timeline Month Index (Recalculated Path View)', color: 'var(--text-secondary)' }, ticks: { autoSkip: true, maxTicksLimit: 12 } },
          y: { stacked: true, min: 0, max: maxLifetimeCost, title: { display: true, text: 'Total Cumulative Output ($)' }, ticks: { callback: v => '$' + v.toLocaleString() } }
        },
        plugins: {
          legend: { display: true, position: 'top', labels: { boxWidth: 12, padding: 10, font: { family: "'Libre Franklin', sans-serif" } } },
          tooltip: { callbacks: { label: function(context) { return ` ${context.dataset.label}: $${context.parsed.y.toFixed(2)}`; } } }
        },
        barPercentage: 0.85,
        categoryPercentage: 0.85
      }
    });
  }
}