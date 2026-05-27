// --- Session Data Tracking (for research purposes May 2026) ---
// Variables which track user interactions, timing, and choices for research analysis.
let tracking = {
  startTime: Date.now(),
  endTime: null,
  completed: false,
  interactionCount: 0,
  sliderMoves: 0,
  firstChoice: null,
  finalChoice: null,
  customAmount: null,
  usedSlider: false,
  usedCustomInput: false,
  firstSliderUseTime: null,
  firstCustomInputTime: null
};
// Flag to prevent input conflicts and multiple submissions
let isTyping = false;
let submitted = false;
let stackedChart;

const sessionId = crypto.randomUUID();

// --- Calculator Constants ---
const STATEMENT_BALANCE = 1836.90;
const CURRENT_BALANCE   = 1875.11; // Amortization balance threshold base
const MIN_PAYMENT       = 38.00;
const ANNUAL_RATE       = 0.21;
const MONTHLY_RATE      = ANNUAL_RATE / 12;

const paymentRange = document.getElementById('paymentRange');
const paymentInput = document.getElementById('paymentInput');
const yearsOut     = document.getElementById('yearsOut');
const totalOut     = document.getElementById('totalOut');
const descPayment  = document.getElementById('descPayment');
const descYears    = document.getElementById('descYears');
const descTotal    = document.getElementById('descTotal');
// --- Core Calculation and Display Logic ---
function compute(payment) {
  const balance = CURRENT_BALANCE;
  const monthlyPayment = Math.max(0, Number(payment) || 0);
  if (monthlyPayment <= balance * MONTHLY_RATE) return { pay: monthlyPayment, years: Infinity, total: Infinity, months: Infinity };
  if (monthlyPayment >= balance) return { pay: monthlyPayment, years: 0, total: balance, months: 1 };
  
  const months = Math.log(monthlyPayment / (monthlyPayment - MONTHLY_RATE * balance)) / Math.log(1 + MONTHLY_RATE);
  const years = months / 12;
  const total = monthlyPayment * months;
  return { pay: monthlyPayment, years, total, months };
}
// Updates the displayed payment, total cost, and syncs the range slider with the custom input if applicable.
function updateDisplay(pay, total) {
  const formattedPay = pay.toFixed(2);
  const formattedTotal = total.toFixed(2);

  totalOut.textContent   = `$${formattedTotal}`;
  descPayment.textContent = formattedPay;
  descTotal.textContent   = formattedTotal;
  paymentRange.value      = Math.min(pay, CURRENT_BALANCE).toFixed(2);

  // Sync textbox value ONLY if user is targeting custom entry and isn't mid-type
  const otherRadio = document.querySelector('input[name="payOption"][value="other"]');
  if (!isTyping && otherRadio && otherRadio.checked) {
    paymentInput.value = formattedPay;
  }
}
// Main function to render the results based on the payment input, including time to payoff and total cost, with proper formatting and edge case handling.
function render(payment) {
  if (!payment || isNaN(payment) || payment <= 0) return;

  const { pay, years, total, months } = compute(payment);
  
  if (!isFinite(years)) {
    // Cleanly update text elements to reflect an infinite timeline
    totalOut.textContent   = "$∞";
    descPayment.textContent = pay.toFixed(2);
    descTotal.textContent   = "Infinity (Balance will grow)";
    yearsOut.textContent    = "Never";
    descYears.textContent   = "an infinite amount of time";
    
    // Clear out or reset your Chart.js data so it doesn't freeze old data
    if (stackedChart) {
      stackedChart.data.labels = ["Balance Accrues"];
      stackedChart.data.datasets[0].data = [CURRENT_BALANCE]; // Visual block
      stackedChart.data.datasets[1].data = [0];
      stackedChart.update();
    }
    return;
  }

  // Otherwise, proceed with normal update display...
  updateDisplay(pay, total);

  const totalMonths = Math.ceil(months);
  let timeText = "";

  if (totalMonths <= 0) {
    timeText = "0 months";
  } else if (totalMonths === 1) {
    timeText = "1 month";
  } else if (totalMonths < 12) {
    timeText = `${totalMonths} months`;
  } else {
    const wholeYears = Math.floor(totalMonths / 12);
    const remainingMonths = totalMonths % 12;

    if (remainingMonths === 0) {
      timeText = wholeYears === 1 ? "1 year" : `${wholeYears} years`;
    } else {
      const yearLabel = wholeYears === 1 ? "year" : "years";
      const monthLabel = remainingMonths === 1 ? "month" : "months";
      timeText = `${wholeYears} ${yearLabel} and ${remainingMonths} ${monthLabel}`;
    }
  }

  yearsOut.textContent = totalMonths <= 12 ? timeText : `${timeText}\n(${totalMonths} months)`;
  descYears.textContent = totalMonths <= 1 ? timeText : `about ${timeText}`;

  // Update Visuals
  updateCharts(payment);
}

// --- Chart.js Graph Amortization Generation ---
function updateCharts(payment) {
  const { pay, years, months } = compute(payment);
  if (!isFinite(years)) return;

  const totalMonths = Math.ceil(months);
  const labels = Array.from({ length: totalMonths }, (_, i) => `${i + 1}`);

  let balance = CURRENT_BALANCE;
  const cumulativeInterest = [];
  const cumulativePrincipal = [];
  let totalInterestSoFar = 0;
  let totalPrincipalSoFar = 0;

  for (let m = 1; m <= totalMonths; m++) {
    const interest = balance * MONTHLY_RATE;
    const principal = Math.min(pay - interest, balance);
    balance -= principal;
    
    totalInterestSoFar += interest;
    totalPrincipalSoFar += principal;
    
    cumulativeInterest.push(totalInterestSoFar);
    cumulativePrincipal.push(totalPrincipalSoFar);
  }

  const stkCtx = document.getElementById("stackedChart").getContext("2d");

  if (stackedChart) stackedChart.destroy();

  stackedChart = new Chart(stkCtx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Cumulative Interest Paid", data: cumulativeInterest, backgroundColor: "#EAAA00" },
        { label: "Cumulative Principal Paid", data: cumulativePrincipal, backgroundColor: "#8A100B" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          title: {
            display: true,
            text: 'Month',
            font: { size: 13, weight: '500' }
          },
          ticks: { autoSkip: true, maxTicksLimit: 20 }
        },
        y: {
          stacked: true,
          min: 0,
          max: 4500,
          title: {
            display: true,
            text: 'Total Amount Paid ($)',
            font: { size: 13, weight: '500' }
          },
          ticks: {
            callback: function(value) { return '$' + value.toFixed(0); }
          }
        }
      },
      barPercentage: 0.995,
      categoryPercentage: 0.995
    }
  });
}

// --- Dynamic Interactive Event Listeners ---

// Range Slider Changes
// 1. Smoothly update the calculations and graph as they drag (NO count inflation)
paymentRange.addEventListener('input', e => {
  if (!tracking.usedSlider) {
    tracking.usedSlider = true;
    tracking.firstSliderUseTime = Date.now() - tracking.startTime;
  }

  let val = +e.target.value;
  tracking.finalChoice = val;
  if (Math.abs(val - CURRENT_BALANCE) < 0.1) val = CURRENT_BALANCE;
  render(val);
});

// 2. Log EXACTLY one move only when they release their click/finger from the slider
paymentRange.addEventListener('change', e => {
  tracking.sliderMoves++;
  tracking.interactionCount++;
  
  let val = +e.target.value;
  if (Math.abs(val - CURRENT_BALANCE) < 0.1) val = CURRENT_BALANCE;
  
  // Capture their initial instinct if they haven't made a choice yet
  if (!tracking.firstChoice) {
    tracking.firstChoice = val;
  }
});

// Custom Text Entry Focus Checks
paymentInput.addEventListener('focus', () => { isTyping = true; });
paymentInput.addEventListener('blur', () => { isTyping = false; });

// Custom Text Entry Evaluation
paymentInput.addEventListener('input', e => {
  const otherRadio = document.querySelector('input[name="payOption"][value="other"]');
  if (otherRadio && !otherRadio.checked) {
    otherRadio.checked = true;
  }

  const val = parseFloat(e.target.value);
  const errorMessage = document.getElementById('errorMessage');
  
  if (!isNaN(val) && val < 0) {
    errorMessage.style.display = 'block';
    return; 
  } else {
    errorMessage.style.display = 'none';
  }

  if (!isNaN(val)) {
    tracking.interactionCount++;
    if (!tracking.usedCustomInput) {
      tracking.firstCustomInputTime = Date.now() - tracking.startTime;
    }
    tracking.usedCustomInput = true;
    tracking.customAmount = val;
    tracking.finalChoice = val;
    render(val);
  }
});

// Radio Options Selection Sync
document.querySelectorAll('input[name="payOption"]').forEach(radio => {
  radio.addEventListener('change', () => {
    tracking.interactionCount++;
    if (!tracking.firstChoice) {
      tracking.firstChoice = radio.value;
    }

    tracking.finalChoice = radio.value;
    if (radio.value === 'other') {
      const val = +paymentInput.value;
      if (!val) return;
      paymentRange.value = val;
      render(val);
    } else {
      paymentRange.value = radio.value;
      render(+radio.value);
    }
  });
});

// --- Research Metrics Package Serialization ---
function getSessionData() {
  const totalTimeSeconds = (Date.now() - tracking.startTime) / 1000;
  return {
    sessionId,
    completed: tracking.completed,
    interactionCount: tracking.interactionCount,
    sliderMoves: tracking.sliderMoves,
    firstChoice: tracking.firstChoice,
    finalChoice: tracking.finalChoice,
    customAmount: tracking.customAmount,
    usedSlider: tracking.usedSlider,
    usedCustomInput: tracking.usedCustomInput,
    totalTimeSeconds: Number(totalTimeSeconds.toFixed(2)),
    firstSliderUseSeconds: tracking.firstSliderUseTime !== null ? Number((tracking.firstSliderUseTime / 1000).toFixed(2)) : null,
    firstCustomInputSeconds: tracking.firstCustomInputTime !== null ? Number((tracking.firstCustomInputTime / 1000).toFixed(2)) : null,
    startTimestamp: new Date(tracking.startTime).toISOString(),
    endTimestamp: tracking.endTime ? new Date(tracking.endTime).toISOString() : null
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

// Complete interaction lifecycle
document.getElementById("submitSessionBtn").addEventListener("click", () => {
  tracking.endTime = Date.now();
  tracking.completed = true;

  const data = getSessionData();
  sendToQualtrics(data);
  downloadSession();
});