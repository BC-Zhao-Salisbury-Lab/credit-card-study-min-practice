# Qualtrics Implementation — Credit Card Study (7 conditions)

This embeds the payment website inside a Qualtrics survey, randomly assigns each
participant one of the 7 conditions, and stores what they saw/chose in Qualtrics.

**Site URL:** `https://bc-zhao-salisbury-lab.github.io/credit-card-study-min-practice/`
The condition is chosen by the URL parameter `?layout=1` … `?layout=7`.

---

## Step 1 — Create the embedded-data fields

Survey → **Survey Flow** → **Add a New Element → Embedded Data**, place it at the
very top, and add these fields (leave values blank; they get filled in later):

- `layout`            ← the assigned condition (1–7)
- `cc_finalChoice`    ← which payment option they submitted
- `cc_customAmount`   ← the "Other Amount" they typed (if any)
- `cc_usedSlider`     ← whether they moved the slider
- `cc_totalTimeSec`   ← time on the page
- `cc_raw`            ← the full result record (JSON string)

Declaring them here guarantees they are saved with the response.

## Step 2 — Randomly assign the condition

In **Survey Flow**, directly under the embedded-data element:

1. **Add a New Element → Randomizer.**
2. Set it to **"Randomly present 1 of the following"** and check **"Evenly Present
   Elements"** (this keeps the 7 conditions balanced across participants).
3. Inside the Randomizer add **7 Embedded Data elements**, one per condition:
   - Element 1: `Set Embedded Data: layout = 1`
   - Element 2: `Set Embedded Data: layout = 2`
   - … through …
   - Element 7: `Set Embedded Data: layout = 7`
4. Put the survey block that contains the iframe question **below** the Randomizer.

*(Quick alternative if you don't need perfectly even groups: skip the Randomizer
and just set one embedded-data field at the top — `layout = ${rand://int/1:7}`.)*

## Step 3 — Add the website as an iframe question

Create a **Text/Graphic** question in your block. Click the question text, open the
**HTML view (`<>`)**, and paste:

```html
<iframe
  src="https://bc-zhao-salisbury-lab.github.io/credit-card-study-min-practice/?layout=${e://Field/layout}"
  style="display:block; width:100%; height:900px; border:0;"
  title="Monthly payment tool"></iframe>
```

`${e://Field/layout}` inserts the randomly assigned condition, so each participant
loads exactly one of the 7 layouts. (Adjust `height` to fit without inner scrolling.)

## Step 4 — Capture what they did

On that same question, open the gear → **Add JavaScript**, and paste:

```javascript
Qualtrics.SurveyEngine.addOnload(function () {
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.type !== "creditCardStudyData") return;   // ignore other messages
    var p = d.payload || {};
    Qualtrics.SurveyEngine.setEmbeddedData("layout",         p.layout);
    Qualtrics.SurveyEngine.setEmbeddedData("cc_finalChoice", p.finalChoiceLabel || p.finalChoice);
    Qualtrics.SurveyEngine.setEmbeddedData("cc_customAmount", p.customAmount);
    Qualtrics.SurveyEngine.setEmbeddedData("cc_usedSlider",  p.usedSlider);
    Qualtrics.SurveyEngine.setEmbeddedData("cc_totalTimeSec", p.totalTimeSeconds);
    Qualtrics.SurveyEngine.setEmbeddedData("cc_raw",         JSON.stringify(p));
    // Optional: auto-advance to the next page once they submit
    // jQuery("#NextButton").click();
  });
});
```

The website already sends this `postMessage` when the participant clicks
**Submit payment**, so Qualtrics receives and stores the data automatically.

## Step 5 — Test

- Preview the survey; confirm a layout appears and that clicking **Submit payment**
  writes values into the embedded data (check **Data & Analysis** or a preview
  response). Force a specific condition while testing by appending `&layout=3` etc.
- Add `?research=1` to the site URL to open the research panel for manual testing.

---

## ⚠️ One website tweak needed for participants

Right now, clicking **Submit payment** also triggers a **JSON file download** in the
browser — participants would see that file download. Qualtrics still gets the data
through the `postMessage` above, so the download is unnecessary for participants. It
should be suppressed for them (kept only in `?research=1` mode). This is a one-line
change on the website side — let me know and I'll make it.

---

## Data collected & embedded-data fields

The payment tool records the participant's decision **and** rich passive
interaction telemetry. Everything is contained in `cc_raw` (full JSON); the fields
below are the clean, one-value-per-column summaries. Declare each name in Survey
Flow so it exports.

**Decision / choice**

| field | meaning |
|---|---|
| `layout` | assigned condition (1–7) |
| `cc_firstChoice` | first option the participant selected |
| `cc_finalChoice` | option submitted |
| `cc_customAmount` | "Other Amount" entered (blank if none) |
| `cc_usedSlider` | Yes/No — did they move the slider |
| `cc_interactions` | number of choice interactions |
| `cc_totalTimeSec` | seconds on the tool |

**Interaction telemetry**

| field | meaning |
|---|---|
| `cc_mouseClicks` | total mouse clicks |
| `cc_mouseDistPx` | total cursor travel (pixels) |
| `cc_keyPresses` | total key presses |
| `cc_sliderGrabs` | times the slider was grabbed |
| `cc_scrollDepth` | deepest scroll reached (0–1 of page height) |
| `cc_firstInteractSec` | seconds from load to first interaction |
| `cc_timeHiddenSec` | seconds the tab was hidden/inactive |
| `cc_tabBlurCount` | number of times they switched away from the tab |

**Backup (last column)**

| field | meaning |
|---|---|
| `cc_raw` | full JSON record, including the downsampled cursor path (`mousePath`), `clickLog`, `hoverEvents`, `optionHoverCounts`, `sliderValues`, and the focus/blur log |

Use the `saveData()` function in the question JavaScript (see the master JS block)
to write all of these; it also keeps `cc_raw` as the final column.
