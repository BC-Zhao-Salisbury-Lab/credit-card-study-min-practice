# Credit Card Study — Data Dictionary

Every field the interactive payment webpage records for one participant, its
definition, type, and the Qualtrics column it maps to. The webpage bundles all of
these into a single JSON object and sends it to Qualtrics; `cc_raw` is that full
object, and the `cc_*` columns are the individual, spreadsheet‑friendly copies.

**Column naming rule:** each column is named `cc_` + the JSON key, so a column
maps 1‑to‑1 to a key inside `cc_raw` (e.g. column `cc_interactionCount` = the
`interactionCount` key in `cc_raw`). The only exceptions are `layout` (assigned by
the Qualtrics randomizer) and the four `cc_hover*` columns (unpacked from the
`optionHoverCounts` object).

> **Why some columns were blank in the 8/27 test:** the survey had declared field
> names that the older script wasn't writing to (`cc_interactionCount`,
> `cc_totalTimeSeconds`, `cc_usedCustomInput`, `cc_firstSliderUseSeconds`,
> `cc_firstCustomInputSeconds`), and `cc_sliderMoves` never existed. The corrected
> `saveData()` at the bottom writes every field under the matching name, so those
> columns now fill in. Delete the stale `cc_sliderMoves` and `cc_totalTimeSec`
> (short form) fields from Survey Flow.

---

## 1. Identity & condition

| Variable (JSON key) | Column | Type | Definition |
|---|---|---|---|
| `sessionId` | `cc_sessionId` | integer | Random 6‑digit ID generated for this page visit. Lets you match a row to its `cc_raw`; not linked to any personal identity. |
| `layout` | `layout` | 1–7 | The condition/information level shown (assigned by the Qualtrics randomizer, echoed back by the page). |
| `conditionVersion` | *(raw only)* | integer | Internal legacy copy of `layout` (same value). Ignore. |
| `strategyIndex` | *(raw only)* | integer | Internal chart‑type index (a researcher display setting, not participant behavior). |

## 2. Decision (what they chose)

| Variable | Column | Type | Definition |
|---|---|---|---|
| `firstChoice` | `cc_firstChoice` | text | Raw value of the **first** option the participant selected: `2136.90` (statement), `2675.11` (current), `43.00` (minimum), or `other`. |
| `firstChoiceLabel` | `cc_firstChoiceLabel` | text | Human‑readable label of `firstChoice` (e.g. "Minimum Payment ($43.00)"). |
| `finalChoice` | `cc_finalChoice` | text | Raw value of the option they **submitted** (same value set as above). |
| `finalChoiceLabel` | `cc_finalChoiceLabel` | text | Human‑readable label of `finalChoice`. |
| `customAmount` | `cc_customAmount` | number/blank | The dollar amount typed into "Other Amount" (blank if they didn't use it). |
| `allChoices` | `cc_allChoices` | text (list) | Ordered sequence of every payment amount the participant touched (radio selections + logged slider stops), pipe‑separated, e.g. `43.00 \| 500.00 \| 2136.90`. Shows how their choice evolved. |

## 3. Engagement & tool usage

| Variable | Column | Type | Definition |
|---|---|---|---|
| `interactionCount` | `cc_interactionCount` | integer | Total logged decision interactions (radio changes + custom‑input edits + committed slider stops). A rough "how much did they fiddle" count. |
| `usedSlider` | `cc_usedSlider` | Yes/No | Whether they moved the slider at all. |
| `usedCustomInput` | `cc_usedCustomInput` | Yes/No | Whether they typed anything into the "Other Amount" box. |
| `sliderValues` | `cc_sliderValues` | text (list) | Every slider value where the participant paused or released, pipe‑separated in order — the full slider‑exploration path (the `sliderStops/Min/Max/Last` columns are summaries of this). |
| `sliderStops` | `cc_sliderStops` | integer | Number of deliberate slider stops (length of `sliderValues`). |
| `sliderMin` | `cc_sliderMin` | number/blank | Lowest slider value explored. |
| `sliderMax` | `cc_sliderMax` | number/blank | Highest slider value explored. |
| `sliderLast` | `cc_sliderLast` | number/blank | Last slider value before leaving/submitting. |

## 4. Timing (seconds from page load)

| Variable | Column | Type | Definition |
|---|---|---|---|
| `totalTimeSeconds` | `cc_totalTimeSeconds` | seconds | Total time on the payment page, load → submit. |
| `firstInteractionSeconds` | `cc_firstInteractionSeconds` | seconds | Time to the participant's **first action of any kind** (click, move, key, etc.). A latency/hesitation measure. |
| `firstSliderUseSeconds` | `cc_firstSliderUseSeconds` | seconds/blank | Time until they first moved the slider (blank if never). |
| `firstCustomInputSeconds` | `cc_firstCustomInputSeconds` | seconds/blank | Time until they first typed in "Other Amount" (blank if never). |
| `startTimestamp` | `cc_startTimestamp` | ISO datetime | Clock time the page loaded. |
| `endTimestamp` | `cc_endTimestamp` | ISO datetime | Clock time they submitted. |

## 5. Mouse & keyboard activity

| Variable | Column | Type | Definition |
|---|---|---|---|
| `mouseClicks` | `cc_mouseClicks` | integer | Total mouse clicks anywhere on the page. |
| `mouseDistancePx` | `cc_mouseDistancePx` | pixels | Total distance the cursor traveled (sum of movement), a measure of overall mouse activity. |
| `mouseMoveSamples` | `cc_mouseMoveSamples` | integer | Number of cursor‑position samples recorded (~1 per 150 ms of movement); a proxy for how long the mouse was in motion. |
| `keyPresses` | `cc_keyPresses` | integer | Total key presses (mostly typing in "Other Amount"). |
| `sliderGrabs` | `cc_sliderGrabs` | integer | Number of times the slider handle was actually grabbed (pointer/mouse/touch down on it). |
| `clickLog` | `cc_clickLog` | text (list) | Ordered sequence of meaningful clicks with timing, pipe‑separated as `timeMs:label` (labels: `option:*`, `submit`, `notch`, `slider`), e.g. `3200ms:option:43.00 \| 8100ms:submit`. A compact behavioral timeline. |
| `mousePath` | *(raw only)* | array | Down‑sampled cursor trail: `[timeMs, x, y]` (≤600 points). Kept raw‑only because it's hundreds of coordinates — best read from `cc_raw` programmatically, not as a spreadsheet cell. |
| `hoverEvents` | *(raw only)* | array | `[timeMs, target]` each time an option was hovered. The per‑option **counts** are already columns (§7); this is the raw timed sequence. |

## 6. Attention & scrolling

| Variable | Column | Type | Definition |
|---|---|---|---|
| `scrollDepthMax` | `cc_scrollDepthMax` | 0–1 | Deepest point of the page reached, as a fraction of total page height (1 = scrolled to the very bottom). |
| `scrollCount` | `cc_scrollCount` | integer | Number of scroll events (throttled). |
| `timeHiddenSeconds` | `cc_timeHiddenSeconds` | seconds | Total time the browser tab was hidden/inactive (switched away, minimized) — a distraction/off‑task measure. |
| `tabBlurCount` | `cc_tabBlurCount` | integer | Number of times the participant switched away from the survey tab. |
| `focusBlurEvents` | *(raw only)* | array | `[timeMs, 'blur'|'focus']` log of each tab hide/return. |

## 7. Hovering per option (unpacked from `optionHoverCounts`)

`optionHoverCounts` in `cc_raw` is an object counting hovers per option; it's
unpacked into four columns. Useful for "which options did they consider?"

| Column | Type | Definition |
|---|---|---|
| `cc_hoverStatement` | integer | Times the **Statement Balance** ($2,136.90) option was hovered. |
| `cc_hoverCurrent` | integer | Times the **Current Balance** ($2,675.11) option was hovered. |
| `cc_hoverMinimum` | integer | Times the **Minimum Payment** ($43.00) option was hovered. |
| `cc_hoverOther` | integer | Times the **Other Amount** option was hovered. |

## 8. Backup

| Column | Definition |
|---|---|
| `cc_raw` | The complete JSON record for the participant — every field above, plus the handful kept raw‑only (below). Keep it as the last column; it's the fallback for anything you later decide to break out. |

**What is left inside `cc_raw` only, and why:**

- `mousePath` — hundreds of `[time, x, y]` coordinates; too large for a single
  useful cell. Analyze from `cc_raw` if you want to reconstruct movement.
- `hoverEvents`, `focusBlurEvents` — the raw timed sequences; their useful
  summaries are already columns (`cc_hover*`, `cc_tabBlurCount`, `cc_timeHiddenSeconds`).
- `conditionVersion`, `strategyIndex` — internal/legacy values (not participant
  behavior); not worth a column.

Everything else — including `allChoices`, `sliderValues`, and `clickLog` — is now
its own column.

---

## How to capture these in Qualtrics

### A. Replace the `saveData()` function in the payment‑tool question's JavaScript

```javascript
function saveData(p) {
    if (!p) return;
    var hov = p.optionHoverCounts || {};
    var Q = Qualtrics.SurveyEngine;
    function yn(b) { return b ? "Yes" : "No"; }
    function n(v) { return (v == null ? "" : v); }              // preserve missing as blank
    function list(a) { return (a || []).join(" | "); }
    function stamps(a) { return (a || []).map(function (x) { return x[0] + "ms:" + x[1]; }).join(" | "); }
    function triples(a) { return (a || []).map(function (x) { return x.join(","); }).join(" | "); }

    // Meta / identity
    Q.setEmbeddedData("cc_schemaVersion", p.schemaVersion);
    Q.setEmbeddedData("cc_sessionId", p.sessionId);
    // Experimental condition (explicit code + label + factors)
    Q.setEmbeddedData("layout", p.layout);
    Q.setEmbeddedData("cc_conditionCode", p.conditionCode);
    Q.setEmbeddedData("cc_conditionLabel", p.conditionLabel || "");
    Q.setEmbeddedData("cc_infoContent", p.infoContent || "");
    Q.setEmbeddedData("cc_visualDesign", p.visualDesign || "");
    // Decision (raw inputs)
    Q.setEmbeddedData("cc_firstChoice", n(p.firstChoice));
    Q.setEmbeddedData("cc_firstChoiceLabel", p.firstChoiceLabel || "");
    Q.setEmbeddedData("cc_finalChoice", n(p.finalChoice));
    Q.setEmbeddedData("cc_finalChoiceLabel", p.finalChoiceLabel || "");
    Q.setEmbeddedData("cc_customAmount", n(p.customAmount));
    Q.setEmbeddedData("cc_allChoices", list(p.allChoices));
    // Calculated outcome of the final choice (auditable against inputs)
    Q.setEmbeddedData("cc_finalMonthlyPayment", n(p.finalMonthlyPayment));
    Q.setEmbeddedData("cc_finalPayoffMonths", n(p.finalPayoffMonths));
    Q.setEmbeddedData("cc_finalTotalPaid", n(p.finalTotalPaid));
    Q.setEmbeddedData("cc_finalInterest", n(p.finalInterest));
    Q.setEmbeddedData("cc_finalPrincipal", n(p.finalPrincipal));
    // Task assumptions / parameters
    Q.setEmbeddedData("cc_apr", p.apr);
    Q.setEmbeddedData("cc_statementBalance", p.statementBalance);
    Q.setEmbeddedData("cc_currentBalance", p.currentBalance);
    Q.setEmbeddedData("cc_minPayment", p.minPayment);
    // Engagement / tool usage
    Q.setEmbeddedData("cc_interactionCount", p.interactionCount);
    Q.setEmbeddedData("cc_usedSlider", yn(p.usedSlider));
    Q.setEmbeddedData("cc_usedCustomInput", yn(p.usedCustomInput));
    Q.setEmbeddedData("cc_sliderStops", p.sliderStops);
    Q.setEmbeddedData("cc_sliderValues", list(p.sliderValues));
    Q.setEmbeddedData("cc_sliderMin", n(p.sliderMin));
    Q.setEmbeddedData("cc_sliderMax", n(p.sliderMax));
    Q.setEmbeddedData("cc_sliderLast", n(p.sliderLast));
    // Timing (seconds)
    Q.setEmbeddedData("cc_totalTimeSeconds", p.totalTimeSeconds);
    Q.setEmbeddedData("cc_firstInteractionSeconds", n(p.firstInteractionSeconds));
    Q.setEmbeddedData("cc_firstSliderUseSeconds", n(p.firstSliderUseSeconds));
    Q.setEmbeddedData("cc_firstCustomInputSeconds", n(p.firstCustomInputSeconds));
    // Mouse / keyboard
    Q.setEmbeddedData("cc_mouseClicks", p.mouseClicks);
    Q.setEmbeddedData("cc_mouseMoveSamples", p.mouseMoveSamples);
    Q.setEmbeddedData("cc_mouseDistancePx", p.mouseDistancePx);
    Q.setEmbeddedData("cc_keyPresses", p.keyPresses);
    Q.setEmbeddedData("cc_sliderGrabs", p.sliderGrabs);
    Q.setEmbeddedData("cc_clickLog", stamps(p.clickLog));
    Q.setEmbeddedData("cc_mousePath", triples(p.mousePath));
    // Attention / scroll
    Q.setEmbeddedData("cc_scrollDepthMax", p.scrollDepthMax);
    Q.setEmbeddedData("cc_scrollCount", p.scrollCount);
    Q.setEmbeddedData("cc_timeHiddenSeconds", p.timeHiddenSeconds);
    Q.setEmbeddedData("cc_tabBlurCount", p.tabBlurCount);
    Q.setEmbeddedData("cc_focusBlurEvents", stamps(p.focusBlurEvents));
    // Hover per option
    Q.setEmbeddedData("cc_hoverStatement", hov["2136.90"] || 0);
    Q.setEmbeddedData("cc_hoverCurrent", hov["2675.11"] || 0);
    Q.setEmbeddedData("cc_hoverMinimum", hov["43.00"] || 0);
    Q.setEmbeddedData("cc_hoverOther", hov["other"] || 0);
    Q.setEmbeddedData("cc_hoverEvents", stamps(p.hoverEvents));
    // Data quality
    Q.setEmbeddedData("cc_dataQualityFlag", p.dataQualityFlag);
    Q.setEmbeddedData("cc_flagNoChoice", yn(p.flagNoChoice));
    Q.setEmbeddedData("cc_flagNoInteraction", yn(p.flagNoInteraction));
    Q.setEmbeddedData("cc_flagVeryFast", yn(p.flagVeryFast));
    Q.setEmbeddedData("cc_flagNeverPayoff", yn(p.flagNeverPayoff));
    // Internal / legacy (kept for completeness)
    Q.setEmbeddedData("cc_conditionVersion", n(p.conditionVersion));
    Q.setEmbeddedData("cc_strategyIndex", n(p.strategyIndex));
    // Timestamps
    Q.setEmbeddedData("cc_startTimestamp", p.startTimestamp);
    Q.setEmbeddedData("cc_endTimestamp", p.endTimestamp);
    // Full backup (last column) — mirrors everything above, nothing extra hidden
    Q.setEmbeddedData("cc_raw", JSON.stringify(p));
}
```

Every payload field is now its own column; `cc_raw` is a mirror backup, not the
only home of any variable.

### B. Declare these fields in Survey Flow, in this order (= export column order)

```
cc_schemaVersion, cc_sessionId,
layout, cc_conditionCode, cc_conditionLabel, cc_infoContent, cc_visualDesign,
cc_firstChoice, cc_firstChoiceLabel, cc_finalChoice, cc_finalChoiceLabel, cc_customAmount, cc_allChoices,
cc_finalMonthlyPayment, cc_finalPayoffMonths, cc_finalTotalPaid, cc_finalInterest, cc_finalPrincipal,
cc_apr, cc_statementBalance, cc_currentBalance, cc_minPayment,
cc_interactionCount, cc_usedSlider, cc_usedCustomInput, cc_sliderStops, cc_sliderValues, cc_sliderMin, cc_sliderMax, cc_sliderLast,
cc_totalTimeSeconds, cc_firstInteractionSeconds, cc_firstSliderUseSeconds, cc_firstCustomInputSeconds,
cc_mouseClicks, cc_mouseMoveSamples, cc_mouseDistancePx, cc_keyPresses, cc_sliderGrabs, cc_clickLog, cc_mousePath,
cc_scrollDepthMax, cc_scrollCount, cc_timeHiddenSeconds, cc_tabBlurCount, cc_focusBlurEvents,
cc_hoverStatement, cc_hoverCurrent, cc_hoverMinimum, cc_hoverOther, cc_hoverEvents,
cc_dataQualityFlag, cc_flagNoChoice, cc_flagNoInteraction, cc_flagVeryFast, cc_flagNeverPayoff,
cc_conditionVersion, cc_strategyIndex,
cc_startTimestamp, cc_endTimestamp,
cc_raw
```

### C. Delete these stale Survey Flow fields (they'll only ever be blank)

- `cc_sliderMoves` (never produced by the page)
- `cc_totalTimeSec` (superseded by `cc_totalTimeSeconds`)

### D. Republish the website

Push the current `script.js` to GitHub Pages so the newest fields (`sliderStops`,
`sliderMin/Max/Last`, `usedCustomInput`, the mouse/scroll/attention metrics) are
actually included in what the page sends.
