// ─── Study Version Control (MOVED TO TOP) ───────────────────
const urlParams = new URLSearchParams(window.location.search);
// Read ?v= from URL; default to Version 2 if missing
const version = urlParams.get('v') !== null ? parseInt(urlParams.get('v'), 10) : 2; 

console.log("Current detected study condition version:", version);

function applyVersionUI() {
  const sliderSection = document.getElementById("sliderSection");
  const chartSection  = document.getElementById("chartSection");
  const radioOther    = document.querySelector('.option-row--other');

  if (version === 0) {
    console.log("Applying Version 0: Hiding Slider, Chart, and Custom Input");
    if (sliderSection) sliderSection.style.setProperty('display', 'none', 'important');
    if (chartSection)  chartSection.style.setProperty('display', 'none', 'important');
    if (radioOther)    radioOther.style.setProperty('display', 'none', 'important'); 
  } 
  else if (version === 1) {
    console.log("Applying Version 1: Hiding Chart Only");
    if (chartSection)  chartSection.style.setProperty('display', 'none', 'important');
    if (sliderSection) sliderSection.style.removeProperty('display');
    if (radioOther)    radioOther.style.removeProperty('display');
  }
  else {
    console.log("Applying Version 2: Showing Entire Interface");
    if (sliderSection) sliderSection.style.removeProperty('display');
    if (chartSection)  chartSection.style.removeProperty('display');
    if (radioOther)    radioOther.style.removeProperty('display');
  }
}

// Execute visibility adjustments immediately upon DOM parsing
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyVersionUI);
} else {
  applyVersionUI();
}

// ─── Session Data Tracking (for research purposes May 2026) ───
let tracking = {
  startTime: Date.now(),
  endTime: null,
  completed: false,
  interactionCount: 0,
  sliderMoves: 0,
  firstChoice: null,
  finalChoice: null,
  allChoices: [],
  customAmount: null,
  usedSlider: false,
  usedCustomInput: false,
  firstSliderUseTime: null,
  firstCustomInputTime: null
};
let isTyping = false;
let submitted = false;
let stackedChart;

const sessionId = crypto.randomUUID();

const STATEMENT_BALANCE = 1836.90;
const CURRENT_BALANCE   = 1875.11;
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

function updateDisplay(pay, total) {
  const formattedPay = pay.toFixed(2);
  const formattedTotal = total.toFixed(2);
  totalOut.textContent    = `$${formattedTotal}`;
  descPayment.textContent = formattedPay;
  descTotal.textContent   = formattedTotal;
  paymentRange.value      = Math.min(pay, CURRENT_BALANCE).toFixed(2);
  const otherRadio = document.querySelector('input[name="payOption"][value="other"]');
  if (!isTyping && otherRadio && otherRadio.checked) {
    paymentInput.value = formattedPay;
  }
}

function render(payment) {
  if (isNaN(payment) || payment < 0 || payment === "") return;
  const { pay, years, total, months } = compute(payment);

  paymentRange.value = Math.min(pay, CURRENT_BALANCE).toFixed(2);

  const otherRadio = document.querySelector('input[name="payOption"][value="other"]');
  if (!isTyping && otherRadio && otherRadio.checked) {
    paymentInput.value = pay.toFixed(2);
  }

  if (!isFinite(years)) {
    totalOut.textContent    = "$\u221e";
    descPayment.textContent = pay.toFixed(2);
    descTotal.textContent   = "Infinity (Balance will grow)";
    yearsOut.textContent    = "Never";
    descYears.textContent   = "an infinite amount of time";
    if (stackedChart) {
      stackedChart.data.labels = ["Balance Accrues"];
      stackedChart.data.datasets[0].data = [CURRENT_BALANCE];
      stackedChart.data.datasets[1].data = [0];
      stackedChart.update();
    }
    return; 
  }
  
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
  updateCharts(payment);
}

function updateCharts(payment) {
  // Safe exit guard rail mapping
  if (version === 0 || version === 1) return;
  
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
        { label: "Cumulative Interest Paid", data: cumulativeInterest, backgroundColor: "#A7C4B3" },
        { label: "Cumulative Principal Paid", data: cumulativePrincipal, backgroundColor: "#2E6B4F" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          title: { display: true, text: 'Month', font: { size: 13, weight: '500' } },
          ticks: { autoSkip: true, maxTicksLimit: 20 }
        },
        y: {
          stacked: true,
          min: 0,
          max: 4500,
          title: { display: true, text: 'Total Amount Paid ($)', font: { size: 13, weight: '500' } },
          ticks: { callback: function(value) { return '$' + value.toFixed(0); } }
        }
      },
      barPercentage: 0.995,
      categoryPercentage: 0.995
    }
  });
}

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

paymentRange.addEventListener('change', e => {
  tracking.sliderMoves++;
  tracking.interactionCount++;
  
  let val = +e.target.value;
  if (Math.abs(val - CURRENT_BALANCE) < 0.1) val = CURRENT_BALANCE;
  
  if (!tracking.firstChoice) { tracking.firstChoice = val; }
  
  tracking.allChoices.push(Number(val.toFixed(2)));
});

paymentInput.addEventListener('focus', () => { isTyping = true; });
paymentInput.addEventListener('blur',  () => { isTyping = false; });

paymentInput.addEventListener('input', e => {
  const otherRadio = document.querySelector('input[name="payOption"][value="other"]');
  if (otherRadio && !otherRadio.checked) { otherRadio.checked = true; }
  const val = parseFloat(e.target.value);
  const errorMessage = document.getElementById('errorMessage');
  if (!isNaN(val) && val < 0) { errorMessage.style.display = 'block'; return; }
  else { errorMessage.style.display = 'none'; }
  if (!isNaN(val)) {
    tracking.interactionCount++;
    if (!tracking.usedCustomInput) { tracking.firstCustomInputTime = Date.now() - tracking.startTime; }
    tracking.usedCustomInput = true;
    tracking.customAmount = val;
    tracking.finalChoice = val;
    tracking.allChoices.push(Number(val.toFixed(2)));
    render(val);
  }
});

document.querySelectorAll('input[name="payOption"]').forEach(radio => {
  radio.addEventListener('change', () => {
    tracking.interactionCount++;
    if (!tracking.firstChoice) { tracking.firstChoice = radio.value; }
    tracking.finalChoice = radio.value;
    
    if (radio.value === 'other') {
      const val = +paymentInput.value;
      if (!val) return;
      paymentRange.value = val;
      tracking.allChoices.push(Number(val.toFixed(2)));
      render(val);
    } else {
      const val = +radio.value;
      paymentRange.value = val;
      tracking.allChoices.push(Number(val.toFixed(2)));
      render(val);
    }
  });
});

function getSessionData() {
  const totalTimeSeconds = (Date.now() - tracking.startTime) / 1000;
  return {
    sessionId,
    completed: tracking.completed,
    interactionCount: tracking.interactionCount,
    sliderMoves: tracking.sliderMoves,
    firstChoice: tracking.firstChoice,
    finalChoice: tracking.finalChoice,
    allChoices: tracking.allChoices,
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

document.getElementById("submitSessionBtn").addEventListener("click", () => {
  tracking.endTime = Date.now();
  tracking.completed = true;
  const data = getSessionData();
  sendToQualtrics(data);
  downloadSession();
});