// ─── Study Version Control ──────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
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

// ─── Constants & Parameters ─────────────────────────────────
const CURRENT_BALANCE = 1875.11;
const STATEMENT_BALANCE = 1836.90;
const ANNUAL_RATE     = 0.2299; // 22.99%
const MONTHLY_RATE    = ANNUAL_RATE / 12;
const MIN_PAYMENT     = 38.00;

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
  customAmount: null,
  usedSlider: false,
  usedCustomInput: false,
  firstSliderUseTime: null,
  firstCustomInputTime: null
};

// ─── UI Element Selectors ───────────────────────────────────
const yearsOut     = document.getElementById("yearsOut");
const totalOut     = document.getElementById("totalOut");
const paymentRange = document.getElementById("paymentRange");
const paymentInput = document.getElementById("paymentInput");

const descPayment  = document.getElementById("descPayment");
const descYears    = document.getElementById("descYears");
const descTotal    = document.getElementById("descTotal");

const chartCtx     = document.getElementById("stackedChart") ? document.getElementById("stackedChart").getContext("2d") : null;

// ─── Mathematical Core Calculation Engines ──────────────────
function computePayoffMetrics(monthlyPayment) {
if (monthlyPayment >= CURRENT_BALANCE) {
    return { months: 1, totalPaid: CURRENT_BALANCE, totalInterest: 0 };
  }

  if (monthlyPayment <= (CURRENT_BALANCE * MONTHLY_RATE)) {
    return { months: Infinity, totalPaid: Infinity, totalInterest: Infinity };
  }
  
  let balance = CURRENT_BALANCE;
  let totalPaid = 0;
  let totalInterest = 0;
  let months = 0;
  
  while (balance > 0 && months < 1200) { 
    months++;
    const interest = balance * MONTHLY_RATE;
    const principal = Math.min(monthlyPayment - interest, balance);
    
    totalInterest += interest;
    balance -= principal;
    totalPaid += (interest + principal);
  }
  
  return { months, totalPaid, totalInterest };
}

function formatDurationText(totalMonths) {
  if (totalMonths === Infinity || !isFinite(totalMonths)) return "Never (Infinite Timeline)";
  if (totalMonths <= 0) return "0 months";
  
  const years = Math.floor(totalMonths / 12);
  const months = Math.round(totalMonths % 12);
  
  let result = "";
  if (years > 0) result += `${years} year${years > 1 ? 's' : ''}`;
  if (months > 0) {
    if (result.length > 0) result += " and ";
    result += `${months} month${months > 1 ? 's' : ''}`;
  }
  
  if (result === "") result = "Less than a month";
  return `${result}\n(${totalMonths} months)`;
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

function render(paymentAmount) {
  const metrics = computePayoffMetrics(paymentAmount);
  
  yearsOut.textContent = formatDurationText(metrics.months);
  totalOut.textContent = metrics.totalPaid === Infinity ? "Infinite Cost" : `$${metrics.totalPaid.toFixed(2)}`;
  
  descPayment.textContent = paymentAmount.toFixed(2);
  descYears.textContent   = metrics.months === Infinity ? "an infinite horizon" : formatDurationText(metrics.months).replace('\n', ' ');
  descTotal.textContent   = metrics.totalPaid === Infinity ? "Infinite Cost" : metrics.totalPaid.toFixed(2);
  
  updateStatusBadge(paymentAmount);
  updateCharts(paymentAmount);
}

function updateCharts(paymentAmount) {
  if (!chartCtx) return;
  
  if (activeChart) {
    activeChart.destroy();
    activeChart = null;
  }
  
  if (typeof renderStudyChart === 'function') {
    activeChart = renderStudyChart(
      chartCtx, 
      paymentAmount, 
      CURRENT_BALANCE, 
      MONTHLY_RATE, 
      computePayoffMetrics,
      () => { updateCharts(paymentAmount); }
    );
  }
}

// ─── Interactive Form Event Listeners ───────────────────────
document.querySelectorAll('input[name="payOption"]').forEach(radio => {
  radio.addEventListener('change', () => {
    tracking.interactionCount++;
    if (!tracking.firstChoice) { tracking.firstChoice = radio.value; }
    tracking.finalChoice = radio.value;
    
    if (radio.value === 'dynamic-min') {
      if (typeof ACTIVE_STRATEGY !== 'undefined' && (ACTIVE_STRATEGY === 6 || ACTIVE_STRATEGY === 7)) {
        renderDynamicMinimumTrajectory();
      } else {
        paymentRange.value = "38.00";
        tracking.allChoices.push(38.00);
        render(38.00);
      }
    } else if (radio.value === 'other') {
      const val = +paymentInput.value;
      if (isNaN(val)) return;
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

function renderDynamicMinimumTrajectory() {
  let balance = CURRENT_BALANCE;
  let totalPaid = 0;
  let months = 0;
  
  while (balance > 0 && months < 140) {
    months++;
    const interest = balance * MONTHLY_RATE;
    const percentageMin = (balance * 0.01) + interest;
    const effectivePayment = Math.max(MIN_PAYMENT, percentageMin);
    const principal = Math.min(effectivePayment - interest, balance);
    
    balance -= principal;
    totalPaid += (interest + principal);
  }
  
  yearsOut.textContent = `11 years and 8 months\n(${months} months)`;
  totalOut.textContent = `$${totalPaid.toFixed(2)}`;
  descPayment.textContent = "Dynamic Minimum (Monthly Recalculating)";
  descYears.textContent = "11 years and 8 months";
  descTotal.textContent = totalPaid.toFixed(2);
  
  updateStatusBadge(MIN_PAYMENT);
  updateCharts(MIN_PAYMENT);
}

paymentRange.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  
  if (!tracking.usedSlider) {
    tracking.usedSlider = true;
    tracking.firstSliderUseTime = Date.now() - tracking.startTime;
  }
  
  tracking.interactionCount++;
  tracking.allChoices.push(Number(val.toFixed(2)));
  
  const customRadio = document.getElementById("radioOther");
  if (customRadio) {
    customRadio.checked = true;
    tracking.finalChoice = "other";
  }
  
  paymentInput.value = val.toFixed(2);
  tracking.customAmount = Number(val.toFixed(2));
  
  render(val);
});

paymentInput.addEventListener('input', (e) => {
  let val = parseFloat(e.target.value);
  
  if (!tracking.usedCustomInput) {
    tracking.usedCustomInput = true;
    tracking.firstCustomInputTime = Date.now() - tracking.startTime;
  }
  
  tracking.interactionCount++;
  
  if (isNaN(val) || val < 0) {
    render(0);
    return;
  }
  
  if (val > CURRENT_BALANCE) {
    val = CURRENT_BALANCE;
    paymentInput.value = CURRENT_BALANCE.toFixed(2);
  }
  
  tracking.allChoices.push(Number(val.toFixed(2)));
  paymentRange.value = val;
  tracking.customAmount = Number(val.toFixed(2));
  
  const customRadio = document.getElementById("radioOther");
  if (customRadio) {
    customRadio.checked = true;
    tracking.finalChoice = "other";
  }
  
  render(val);
});

paymentInput.addEventListener('blur', (e) => {
  let val = parseFloat(e.target.value);
  if (isNaN(val) || val < 0) {
    paymentInput.value = "0.00";
    paymentRange.value = 0;
    render(0);
  }
});

// ─── Data Extraction & PostMessage Core Logic ───────────────
function resolvePaymentLabel(choiceValue) {
  if (choiceValue === 'dynamic-min') return 'Minimum Payment (Recalculated Monthly)';
  if (choiceValue === '1836.90')    return 'Statement Balance ($1,836.90)';
  if (choiceValue === '1875.11')    return 'Current Balance in Full ($1,875.11)';
  if (choiceValue === 'other')      return `Custom Amount ($${tracking.customAmount !== null ? tracking.customAmount.toFixed(2) : '?'})`;
  return choiceValue ?? null;
}

function getSessionData() {
  tracking.endTime = Date.now();
  const totalTimeSeconds = (tracking.endTime - tracking.startTime) / 1000;

  return {
    sessionId:              tracking.sessionId,
    conditionVersion:       tracking.conditionVersion,
    strategyIndex:          typeof ACTIVE_STRATEGY !== 'undefined' ? ACTIVE_STRATEGY : null,
    interactionCount:       tracking.interactionCount,
    firstChoice:            tracking.firstChoice,
    firstChoiceLabel:       resolvePaymentLabel(tracking.firstChoice),
    finalChoice:            tracking.finalChoice,
    finalChoiceLabel:       resolvePaymentLabel(tracking.finalChoice),
    allChoices:             tracking.allChoices,
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
  
  // Set up the dynamic payment target due date (25 days out from today)
  const targetDueDateEl = document.getElementById("dynamicDueDate");
  if (targetDueDateEl) {
    const today = new Date();
    today.setDate(today.getDate() + 25);
    const formattingOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    targetDueDateEl.textContent = today.toLocaleDateString('en-US', formattingOptions);
  }
  
  // 1. Determine which specific radio button exists based strictly on the ACTIVE_STRATEGY
  let targetRadioValue = "38.00"; // Default for Strategies 1-5
  if (typeof ACTIVE_STRATEGY !== 'undefined' && (ACTIVE_STRATEGY === 6 || ACTIVE_STRATEGY === 7)) {
    targetRadioValue = "dynamic-min"; // Default for Strategies 6-7
  }
  
  // 2. Locate and check exactly ONE radio element matching that value
  const defaultRadio = document.querySelector(`input[name="payOption"][value="${targetRadioValue}"]`);
  
  if (defaultRadio) {
    defaultRadio.checked = true;
    tracking.firstChoice = defaultRadio.value;
    tracking.finalChoice = defaultRadio.value;
  }
  
  // 3. Execute the exact matching rendering pipeline to kick off the application state
  if (targetRadioValue === "dynamic-min") {
    renderDynamicMinimumTrajectory();
  } else {
    render(MIN_PAYMENT);
  }
});