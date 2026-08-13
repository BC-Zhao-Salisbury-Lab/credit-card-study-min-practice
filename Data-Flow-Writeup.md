# How the payment tool collects data and sends it to Qualtrics

## Plain-language summary

The payment tool is a small website (static HTML/JavaScript, hosted on GitHub
Pages) that is embedded inside the Qualtrics survey as a framed page. Everything
the tool does happens **inside the participant's own web browser** — the website
has no server of its own and no database, so it never receives or stores any
participant data on its side. GitHub Pages only delivers the page's files
(the HTML, styling, and code); it does not collect responses.

While a participant uses the tool, their interactions are recorded locally in
the browser: which payment option they select, any custom amount they type,
whether they move the slider, and simple timing information (how long they spend
and when they first use each control). A random, non-identifying session number
is generated for bookkeeping. **No names, email addresses, or other identifying
information are collected by the tool.**

When the participant clicks **"Submit payment,"** the tool bundles these values
into a small data packet and hands it to the surrounding Qualtrics survey page
using the browser's built‑in `postMessage` function. This is a standard, secure
way for an embedded page to talk to the page that contains it, and the message
travels **only within the participant's own browser** — from the framed tool up
to the Qualtrics page. It is not sent to any outside or third‑party server.

A short piece of code in the Qualtrics survey receives that packet and writes
each value into the survey response as "embedded data." From that point on, the
information is stored with the rest of the participant's Qualtrics response, on
Qualtrics' secure servers under Boston College's licensed account, and is handled
exactly like any other survey data.

## What is collected

- The condition (layout 1–7) the participant was shown
- The payment option they submitted (and their first selection)
- Any custom "Other Amount" they entered
- Whether/how they used the slider, and the values they explored
- Number of interactions and timing (total time, time to first slider/custom use)
- A random session ID and start/end timestamps

No personally identifying information is collected by the tool.

## Data path, in one line

Participant's browser (interactions recorded locally) → on "Submit payment," an
in‑browser `postMessage` hands the data to the Qualtrics page → Qualtrics stores
it as embedded data with the survey response. The website never stores data; no
third‑party server is involved.

---

## IRB-ready paragraph

Participants complete an interactive credit‑card payment task presented within
the Qualtrics survey. The task is a small static web page (HTML/JavaScript hosted
on GitHub Pages) embedded as an inline frame inside the Qualtrics survey page. All
processing occurs locally in the participant's web browser; the task page has no
back‑end server or database and does not transmit data to any external or
third‑party service, and the GitHub Pages host only serves the page's files. As
the participant interacts with the task, the page records behavioral data
(the assigned display condition, the payment option chosen, any custom amount
entered, slider use, interaction counts, and timing), along with a randomly
generated non‑identifying session identifier; no personally identifying
information is collected by the task. When the participant submits their payment
choice, the page passes this data to the enclosing Qualtrics survey using the
browser's standard `window.postMessage` API — a message exchanged only between the
embedded frame and its parent page within the participant's own browser. Qualtrics
captures the message and stores the values as embedded data fields on the
participant's survey response. All response data therefore reside within Qualtrics,
on its secure servers under the institution's licensed account, and are protected
by the same access controls and safeguards as the rest of the Qualtrics survey
data.
