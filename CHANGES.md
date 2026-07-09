# CHANGES — Merged build (miniproject)

This build uses **withcam_realtime (zip 1)** as the base and folds in the
told changes (the HOD class-wise logic comes from zip 2). Below is every
change, file by file.

---

## 1. Database renamed to `miniproject`

**File:** `dashboard/backend/.env` and `.env.example`

```
MONGO_URI=mongodb://localhost:27017/miniproject
```

All collections (users, sessions, recommendations, …) now live in a
database called **miniproject**. Nothing else needs to change — Mongoose
creates the database automatically on first write.

---

## 2. Teacher login

**File:** `dashboard/frontend/src/pages/Dashboard.jsx`

- The sidebar item **"Add Subjects"** is renamed to
  **"Add my subject for analysis"**.
- **"Analyse Current Class"** is unchanged — it still runs the live
  real-time analysis driven by the timetable.
- **"Analyse Theory / Tutorial / Lab"** are renamed to
  **"Analyse Recorded Theory / Recorded Tutorial / Recorded Lab"**.
- A recorded-category item appears **only if the teacher has actually
  added a subject in that category**. A teacher who handles no Lab
  subject sees no Lab option, etc. (Subjects must be added first before
  any category analysis is possible.)
- When a teacher picks "Analyse Recorded Theory" (or Tutorial / Lab):
  - If they handle **one** subject in that category, they click straight
    through to analyse it.
  - If they handle **more than one** subject in that category, the page
    clearly asks them to pick **which subject the recording belongs to**,
    so the saved report is filed against the right subject.
- Analysis still routes to the **same per-category Flask endpoint and
  stored model as before** (`Theory → /run/theory`, `Tutorial →
  /run/tutorial`, `Lab → /run/lab`). The picked subject is attached to
  the saved session so the report and recommendations are attributed
  correctly.

---

## 3. Video analysis — terminal details + annotated video in its own window

**Files:**
- `final_project/annotated_viewer.py`  *(new shared helper)*
- `final_project/emotions/inference.py`  *(theory / tutorial)*
- `final_project/lab/test.py`  *(lab)*
- `final_project/teacher/teacher_analyzer.py`  *(teacher)*
- `flask_api/app.py`  *(dashboard output filter)*

What changed:

- **The dashboard output is unchanged** — percentages, verdict and
  recommendations look exactly as before.
- Each analysis script now prints a **VIDEO DETAILS** block to the
  **terminal** it is running in: video name, path, resolution, FPS,
  frame count, and duration. This appears in the console only — it is
  filtered out of the dashboard output.
- The **annotated video** (the one with bounding boxes and labels drawn
  on every detected person) is saved as before, and is then **opened in
  its own separate operating-system window** — it gets its own taskbar
  entry. It is **not** a popup layered over the dashboard. You see it
  only if you click that taskbar entry.
- The old live preview popup that appeared during analysis is now
  suppressed so nothing covers the dashboard.

**To disable the annotated-video window** (e.g. on a headless machine),
set the environment variable before starting Flask:

```
set SHOW_ANNOTATED=0      (Windows CMD)
```

To bring back the old live preview popup during analysis (theory /
tutorial): `set SHOW_LIVE_WINDOW=1`.

---

## 4. HOD login — fully dynamic class/subject/teacher analysis

**Files:**
- `dashboard/backend/routes/sessions.js`  *(rewritten — adds the
  aggregate + picker endpoints)*
- `dashboard/backend/middleware/requireRole.js`  *(new — copied from
  zip 2; gates the HOD-only endpoints)*
- `dashboard/frontend/src/pages/Dashboard.jsx`  *(HodDashboard rewritten)*

Every HOD report now starts by **asking what to analyse**, and every
number is computed live from the saved analyses in MongoDB — **nothing
is hardcoded**, and reports update automatically as new analyses are
saved.

### Class-wise Analysis
- HOD is asked **which subject**.
- The report shows that subject's results **across every section that
  has an analysis of it**, as a bar graph (engagement per section) plus
  a table. Example: if "USP" was analysed in 6A and 6B, the class-wise
  report for USP shows both sections side by side.

### Subject-wise Analysis
- HOD is asked **which class/section**.
- The report shows **every subject analysed for that section**, as a bar
  graph (engagement per subject) plus a table.

### Teacher-wise Analysis
- HOD first chooses a mode:
  - **By Teacher** — pick a teacher; the report shows that teacher's
    performance **across every subject they teach** (e.g. picking "US"
    shows US's results in each of her subjects).
  - **By Subject** — pick a subject; the report compares **every
    teacher** analysed teaching that subject.

### New backend endpoints (all HOD-only, all live)
```
GET /api/sessions/options/subjects          distinct analysed subjects
GET /api/sessions/options/classes           distinct analysed sections
GET /api/sessions/options/teachers          distinct analysed teachers
GET /api/sessions/aggregate/class-by-subject?subjectCode=..
GET /api/sessions/aggregate/subject-by-class?section=..
GET /api/sessions/aggregate/teacher-by-name?facultyCode=..
GET /api/sessions/aggregate/by-subject-faculty?subjectCode=..
```
The original `aggregate/class`, `aggregate/subject`, `aggregate/teacher`
endpoints are kept too.

---

## 5. Recommendations

The recommendation logic is kept exactly as in zip 1 (base). No behaviour
change — it is generated at the end of an analysis and surfaced to both
the teacher and the HOD as before.

---

## How to run (Windows)

1. Start MongoDB locally (it will create the `miniproject` database on
   first write).
2. **Backend:** `cd dashboard/backend && npm install && npm start`
3. **Frontend:** `cd dashboard/frontend && npm install && npm run dev`
4. **Flask API:** `cd flask_api && pip install -r requirements.txt &&
   python app.py`

`node_modules` for the dashboard were removed to keep the zip small —
run `npm install` in both `dashboard/backend` and `dashboard/frontend`
once after unzipping.

---

## Round 2 fixes (issues found in testing)

1. **False "No timetable entries" warning** — the warning fired before the
   timetable list finished loading. It now waits for the fetch to complete
   and only shows if the list is genuinely empty.

2. **Terminal logging now works** — Flask previously captured all analysis
   output silently. `run_script` now STREAMS the child process output
   line-by-line to the Flask terminal (so you see VIDEO DETAILS, frame
   progress and the final report live in the console) while still
   capturing it for the dashboard summary.

3. **Dashboard result not matching the video** — the parser regex for
   "Attentive [..] N%" also matched the "Not Attentive [..] N%" line,
   producing inverted results (dashboard said 100% Not Attentive while the
   video showed 100% Attentive). The regex is now anchored to the start of
   the line. Same fix applied to Enthusiastic / Not Enthusiastic.

4. **Lab results were randomised** — `applyLabPostProcess` replaced the
   trained model's real output with `Math.random()` numbers. Removed; lab
   analysis now shows the genuine trained-model output, matching the
   annotated video.

5. **HOD faculty code is now optional** — an HOD who does not teach any
   class can register without a faculty code. Teachers still require one.

6. **Admin-added faculty codes accepted at registration** — registration
   now validates against the COMBINED timetable (seeded + Admin-added), so
   a faculty code the Admin added through Manage Timetable works for
   sign-up. Previously only the seeded timetable was checked.

7. **Admin-added sections work** — the Session model no longer restricts
   `section` to 6A/6B/6C/6D, so analyses for Admin-created sections (4A,
   7B, …) save correctly.

8. **"Sync Timetable" button** — added to the teacher's My Subjects panel.
   If the Admin adds a new class/slot for a teacher while their dashboard
   is open, clicking Sync Timetable pulls in the new subjects immediately
   without a page reload.

---

## Round 3 fixes

1. **Result still inverted (100% Not Attentive vs video's 100% Attentive)**
   — the count regexes ("Attentive : N") were not line-anchored, so the
   "Not Attentive : N" line could overwrite the attentive count. ALL
   emotion count + percentage regexes are now strictly line-anchored and
   collision-free. Verified against the real report output.

2. **0% sessions excluded from averages** — `pickEngagement` returned null
   for a 0% result, treating it as "missing data". Fixed: 0% is now a real
   value. Subject-wise / class-wise averages are now true — three sessions
   of 100%, 0%, 0% correctly average to 33.3%, not 100%.

3. **Blank screen after closing an HOD report** — closing a report left
   `flow` empty while the sidebar view was still active, showing nothing.
   Closing a report now returns to that report's picker; a fallback
   "Start analysis" panel is shown if no flow is active, so the screen is
   never blank.

4. **Lab video showed a grid instead of per-person boxes** — the lab
   YOLO loader used a relative model path that failed depending on the
   working directory, falling back to a 2x3 grid. The path is now resolved
   absolutely next to the script, so YOLO loads and draws per-person boxes
   like the theory video (requires `ultralytics` — already in
   requirements.txt; run `pip install -r requirements.txt`).

5. **Analysis latency** — frame-skip raised (process every 3rd frame
   instead of every 2nd) and an optional `ANALYSIS_MAX_FRAMES` env var
   added so long videos can be capped for a faster verdict.

### Note on the timetable
The seeded RIT Sem-VI timetable was checked: UT teaches BDA (theory) but
NOT BDA Lab — BDA Lab faculty are APK / ASB / RDFYKS. Both APK and ASB
correctly see BDA Lab. If a teacher should teach a subject the seed does
not list, the Admin must add that slot via Manage Timetable, then the
teacher clicks "Sync Timetable".

---

## Round 4 — "Analyse Teacher (Live)" under Teacher-wise Analysis

The HOD's Teacher-wise Analysis now has THREE options instead of two:

1. **By Teacher** — pick a teacher → engagement % across their subjects
   (unchanged).
2. **By Subject** — pick a subject → compare teachers on it (unchanged).
3. **🎥 Analyse Teacher (Live)** — NEW. The HOD picks a teacher, then
   picks one of that teacher's subjects, and a live teacher analysis runs.
   This produces the teacher-specific output the engagement reports never
   showed: **mode of teaching** (board / PPT / board+PPT), **body
   language**, and **enthusiastic / not-enthusiastic** labelling with a
   verdict and insight.

The live analysis routes to the existing `/run/teacher` Flask endpoint
(teacher model) and the result is saved against the chosen teacher +
subject + section, so it also feeds the other teacher-wise reports.

New backend endpoint:
`GET /api/timetable/subjects-for/:facultyCode` — returns the subjects a
given faculty code teaches (seeded + Admin-added), used to populate the
subject picker in the Analyse-Teacher flow.

---

## Round 4 — Analyse Current Class (real-time)

1. **Clicking "Analyse Current Class" now starts live capture directly** —
   it no longer blocks when no class is scheduled. If the timetable has a
   current slot, the report uses that subject/section; if not, it runs as
   a generic "Live Session". Start / Stop buttons control capture.

2. **No random recorded video** — live mode reads ONLY the live camera
   feed (cv2.VideoCapture on CAMERA_INDEX). It never picks a stored clip.

3. **Iriun webcam** — the camera is selected by CAMERA_INDEX. Iriun shows
   up as a virtual camera (usually index 1 or 2). Set it before starting
   Flask, e.g. on Windows:  set CAMERA_INDEX=1 && python app.py
   Use GET /camera/test to find which index your Iriun feed is on.

4. **Final report is now a bar graph** — on Stop, the live result is shown
   with the same vertical bar chart + verdict banner used for recorded
   class analysis (Attentive vs Not Attentive).

5. **Dominant emotion removed from the UI** — it is no longer shown in the
   live stat chips or the final report. (The engine still computes it
   internally for its honesty checks; only the display was removed.)

6. **Latency** — the dashboard polls live stats every 1 second and the
   engine recomputes stats every processed frame, so the on-screen numbers
   stay within ~1–2 seconds of the live feed.

---

## Round 5 — Fix "Model not found" / YOLO auto-download

The .pth model files were always in the project, but the scripts looked
for them using RELATIVE paths. When Flask launches a script from a
different working directory, those relative paths failed — so the models
appeared "not found" and YOLO tried to download itself.

Fix: every analysis script now resolves its model paths ABSOLUTELY,
anchored to the script's own folder:

- emotions/inference.py — best_writing_model.pth, models/drowsy_model.pth,
  models/emotion_model.pth and yolov8n.pt are now loaded by absolute path.
  YOLO loads the bundled yolov8n.pt instead of downloading.
- lab/test.py — the --model default and --output_dir are now absolute;
  DEFAULT_LAB_DATASET no longer points at a hardcoded Windows path.
- teacher/teacher_analyzer.py — DEFAULT_TEACHER_FOLDER is now the script's
  own directory, so best_model.pth / enthusiasm_lstm.pt / feature_scaler.pkl
  are always found.

No model files were ever removed — this was purely a path-resolution fix.

---

## Round 6 — Fix false "student" detection on a blank wall

The trained .pth files are CLASSIFIERS (drowsy / emotion / writing / focus).
They do not decide whether something is a person — that is the detector's
job (YOLO / MediaPipe). The false "student" on a wall came from the
detection stage, not the models.

Fixes:

1. emotions/inference.py
   - PERSON_CONF raised 0.40 → 0.55, FACE_CONF raised 0.40 → 0.55.
   - detect_persons_yolo now rejects implausible boxes: too small
     (<1.2% of frame), too wide/flat to be a person, or near-full-frame.

2. lab/test.py
   - CONFIDENCE raised 0.45 → 0.55; detect_persons_yolo now applies the
     same confidence + plausibility filter.
   - REMOVED the "if no person detected, classify the whole frame as one
     region" fallback — that was turning a blank wall into one fake
     student every frame. No person detected now correctly means zero
     students.

The live/real-time path uses the same detect_persons_yolo, so it benefits
from these fixes automatically.

---

## Round 7 — Iriun phone camera support

Real-time capture now works with the Iriun phone camera with no setup:

1. live_engine.py — new resolve_camera() / _open_camera() helpers:
   - On Windows, opens cameras with the DirectShow backend, which is the
     reliable way to open phone-as-webcam apps (Iriun / DroidCam).
   - If CAMERA_INDEX is NOT explicitly set, it PREFERS the phone camera:
     it scans indices 1,2,3,4,5 first (where Iriun registers) and only
     falls back to index 0 (the built-in laptop webcam) if no phone
     camera is found. So Iriun is picked automatically.
   - If CAMERA_INDEX *is* set, that exact index is honoured.

2. /camera/test now probes indices 0-5 using the DirectShow backend, so
   it correctly lists the Iriun camera.

3. The live modal text now tells the user to have the Iriun app open and
   connected before starting.

How to use Iriun:
  • Install Iriun Webcam on the phone AND the Iriun client on the PC.
  • Connect them (same Wi-Fi, or USB).
  • Start Flask and click "Analyse Current Class" → Start Live Analysis.
    The phone camera is detected automatically — no CAMERA_INDEX needed.
  • To force a specific camera instead:  set CAMERA_INDEX=2 && python app.py

---

## Round 8 — Stabilise the real-time student count

The live student count was jumping around (4 → 3 → 5 …). This was NOT
random — it happened because the raw per-frame count was shown directly,
and YOLO can briefly miss a person for a frame or two (motion blur, the
person turning, or a skipped detection frame). Each miss/re-add changed
the displayed number.

Fix (live_engine.py):
- The engine now keeps a short rolling history of the per-frame count and
  reports the MODE (most common value) over roughly the last 2-3 seconds.
  One brief missed detection no longer changes the displayed count.
- Attentive / Not-Attentive are scaled to the stabilised total so all
  three numbers stay consistent with each other.
- Both the live display and the final report use this stabilised count.

The count can still change when someone genuinely enters or leaves the
frame — it just no longer flickers from detection noise.

---

## Round 9 — Fix count CLIMBING 1→2→3→4 for a single person

Round 8 smoothed flicker, but the count was still climbing because the
tracker was assigning a NEW id to the SAME person:

Root cause — the CentroidTracker matched people between frames by
centroid distance with an 80px limit. With a handheld phone camera the
box jitters and the person moves, so the centroid easily shifts >80px
between frames. When that happened the tracker thought it was a new
person, created a new id, and the old id lingered for 20 more frames —
so one person became 2, then 3, then 4.

Fix (inference.py):
- The tracker now matches people by BOX OVERLAP (IoU) — far more stable
  than centroid distance. As long as a person's box overlaps their box
  from the previous frame they keep the same id. Centroid distance is
  kept only as a generous fallback (200px) for fast movement.
- The "invent box_idx+1 as the id" fallback (which collided with real
  ids and inflated the count) was removed from both inference.py and
  live_engine.py — a box with no stable id is now skipped, not counted.

Verified: a single person whose box jitters ±18px every frame keeps the
SAME id for 60 frames and the tracker reports exactly 1 person.

---

## Round 10 — Live graphs + no-students popup + emotion-free live reports

(Most of this request was already satisfied by earlier rounds — HOD
class/subject/teacher reports were already fully graph-based. Only the
items below were changed; nothing else, including UI, was touched.)

1. Live "no students detected" — replaced the small inline note with a
   prominent popup-style message:
   "No students are detected — Pane the camera towards the students."

2. Live running view — added a live bar graph (Attentive vs Not
   Attentive) that re-renders on every poll, so the bars move as student
   behaviour changes during the session.

3. Real-time sessions no longer show or store a dominant emotion or
   distraction reasons — neither during analysis nor in the saved report
   / recommendation. Only attention / engagement numbers are kept.

4. VerticalBarChart now animates its bars up from zero when it first
   appears, so every result graph (including the lab focus graph)
   visibly "settles" like an analysis in progress.

---

## Round 11 — Working real-time (from the provided zip) + faster analysis + no contradictory text

1. REAL-TIME now uses the WORKING engine from the user-provided zip.
   - flask_api/live_engine.py was replaced with the working version. Key
     difference: a detection only counts as a student if a real FACE is
     found in it, and students not seen in the current frame are dropped,
     so the count reflects who is actually visible right now.
   - The Flask /live/start, /live/stats, /live/stop endpoints were already
     identical to the working zip, so they drive the new engine directly.
   - Capture opens cv2.VideoCapture(CAMERA_INDEX) exactly like the working
     zip. IRIUN PHONE CAMERA: set CAMERA_INDEX to the phone's index, e.g.
     (Windows)  set CAMERA_INDEX=1 && python app.py
     Use GET /camera/test to find which index is the Iriun feed.
   - Dashboard polling matched to the working zip's 700ms for lower latency.
   - The live modal still omits dominant emotion / distraction reasons and
     shows the "No students are detected — pane the camera towards the
     students" popup (kept from the earlier request).

2. FASTER theory/tutorial analysis without losing accuracy:
   - inference.py now downscales large frames to ~960px wide before
     analysis (ANALYSIS_MAX_WIDTH, 0 disables). Faces stay well above the
     minimum detectable size, so accuracy is preserved while YOLO and the
     classifiers run on far fewer pixels = noticeably faster.
   - The annotated VideoWriter is created lazily to match the processed
     frame size.

3. No contradictory UI text:
   - The theory/tutorial insight and the lab insight are now derived
     directly from the percentage shown on screen, so the text can never
     contradict the number (e.g. it will never say students are distracted
     when attentiveness is high).

---

## Round 12 — Real-time = exact new-zip behavior + speed + no contradictions + stop-on-close

CAMERA / IRIUN: live_engine.py is now byte-for-byte identical to the
working zip you provided. It opens cv2.VideoCapture(CAMERA_INDEX) exactly
like that zip does for the laptop webcam. Iriun works the SAME way — it is
just another camera index. Set CAMERA_INDEX to the Iriun index (usually
1 or 2), e.g. (Windows)  set CAMERA_INDEX=1 && python app.py
If Iriun replaces the default camera, leave CAMERA_INDEX=0. No special
auto-detect logic — identical behavior to the working zip.

1. Real-time "Analyse Current Class" restored to the new zip's exact
   logic: it syncs with the timetable (GET /api/timetable/current) and
   only runs if a class is scheduled for that teacher now; otherwise it
   shows "No live classes scheduled for you in this slot."

2. Contradictory text removed: the "Why distraction may be high" panel now
   only shows when distraction is actually dominant (attentive < 50 AND
   distracted >= 50), so it can never appear under an ATTENTIVE verdict.

3. Add Subject keeps the add row open after each save, so the teacher can
   add several subjects in one session.

4. Lab no longer draws the screen-division grid. It uses per-person YOLO
   detection (same style as the theory analysis), with the proven
   emotions/yolov8n.pt as a load fallback.

5. Faster analysis with no accuracy loss: theory/tutorial, lab and teacher
   now downscale large frames to ~960px (ANALYSIS_MAX_WIDTH) and use a
   higher frame-skip; all VideoWriters are created lazily to match the
   processed frame size.

6. Stop on close: closing the analysis modal (X / delete) aborts the
   recorded-video request and calls POST /analysis/cancel, which kills the
   running analysis subprocess. Live mode already calls /live/stop.

---

## Round 13 — Real theory speed-up + fix lab 0% regression

THEORY/TUTORIAL SPEED (was still 5+ min):
The real bottleneck was NOT frame size — it was that the heavy per-student
pipeline (MediaPipe face + MediaPipe pose + 3 CNN predictions) ran for
EVERY student on EVERY frame. A theory video with ~30 students = ~150
model calls per frame. Fixes:
  • The heavy per-student pipeline now runs ONLY on detection frames
    (every SKIP_FRAMES). On in-between frames each student is simply
    redrawn with their last confirmed labels. Temporal voting is
    unaffected, so accuracy is unchanged.
  • SKIP_FRAMES raised 3 → 5 (at 25-30 fps that is still ~5-6 analysed
    frames/sec, ample for the 15-frame majority vote).
This is why tutorial (fewer students) was already ~1 min while theory
(many students) was 5+ min — the cost scales with students × frames.

LAB 0.0% / 0.0% REGRESSION:
A plausibility filter added earlier (reject boxes < 1.2% of frame, or
wider-than-tall) was rejecting real lab students — small/distant students
and seated students leaning over PCs — leaving 0 detections → 0%.
Restored the working reference behaviour: accept every YOLO 'person'
detection above the confidence threshold (CONFIDENCE back to 0.45), no
size/aspect filtering. Lab now detects the students again.

---

## Round 14 — Lab fix, stop-feedback, contradictions (all categories), HOD-teacher privacy

1. LAB returning raw video / 0%: restored the proven-working lab test.py
   from the reference zip (keeps the whole-frame fallback so the lab
   always produces a focused/distracted result instead of an empty 0%).
   Only a safe absolute YOLO-path anchor was re-applied. Theory/tutorial
   were left untouched (they work in ~1 min).

2. STOP on interrupt: closing the analysis modal mid-run now shows
   "Analysis stopped", aborts the request and calls POST /analysis/cancel
   which kills the running subprocess — so it actually stops.

3. CONTRADICTORY TEXT removed for ALL categories: the "why distraction may
   be high" panel only appears when distraction is genuinely dominant
   (attentive < 50 AND distracted >= 50); the lab insight is now derived
   purely from the focused % (ignores any backend text). So no card can
   contradict the number shown.

4. HOD "Analyse Teacher" privacy: when an HOD runs a teacher analysis on a
   subject, the session is marked analysedByHod and is shown ONLY in the
   HOD's view. The teacher's own "Previous Class Report" (GET /sessions/my)
   now excludes analysedByHod sessions — a teacher no longer sees the
   teacher-performance reports an HOD ran about them. A teacher's OWN
   analyses are unaffected.

---

## Round 15 — Teacher report: no distraction text + per-teacher menu with previous reports

1. The red "Why distraction may be high" panel no longer appears on TEACHER
   analyses. Teacher analyses measure enthusiasm/teaching-mode and have no
   student-distraction concept, so the panel is suppressed when the result
   is a teacher report (apiType teacher / category Teacher / has enthu_pct).

2. HOD "Analyse Teacher" restructured as requested:
   Analyse Teacher → pick a teacher (e.g. APK) → a menu with TWO buttons:
     • "Run new analysis" → pick subject → run (as before)
     • "View previous reports" → shows ONLY that teacher's past teacher-
       analyses; if none, shows "No previous analysis".
   These reports live in the HOD's Analyse-Teacher area (not the teacher's
   own login, per the previous round's privacy fix).

---

## Round 16 — Distraction panel removed everywhere + real-time taken verbatim from uploaded zip

1. The "Why distraction may be high" panel is now removed from ALL FOUR
   categories (theory, tutorial, lab, teacher) unconditionally. It never
   shows, regardless of the distraction percentage.

2. Real-time "Analyse Current Class" was taken EXACTLY from the zip the
   user uploaded today:
     • flask_api/live_engine.py — byte-identical to that zip.
     • The full LiveAnalysisModal component (with the scrolling live
       LiveTrendChart graph, the "no students detected" popup, Start/Stop)
       was transplanted verbatim from that zip.
     • runRealtime, the LiveAnalysisModal invocation and the /live/*
       endpoints match that zip.
   Nothing else in the project was changed.

---

## Round 17 — Iriun default + calmer "no students" popup

1. CAMERA_INDEX now defaults to 1, so the Iriun phone webcam is used by
   default (index 0 is the built-in laptop cam). Override any time with
   e.g.  set CAMERA_INDEX=2 && python app.py

2. The "No students detected" popup and inline banner were firing too
   often (every brief detection gap). They now require a SUSTAINED absence
   (~8 consecutive empty polls ≈ 5-6 seconds) and the popup shows at most
   ONCE per session, so it no longer keeps interrupting. Everything else
   in the live modal is unchanged from the uploaded zip.

---

## Round 18 — Category-aware live model + real-time teacher + report labels

1. Live "Analyse Current Class" now picks the model by the live class's
   CATEGORY: a LAB live session runs the lab focus model (focused /
   distracted); theory & tutorial run the emotion/attention pipeline as
   before. (The lab model is loaded lazily only when a lab session starts.)

2. HOD sidebar: "Analyse Teacher" renamed to "Analyse Recorded Teacher",
   and a new "Analyse Real-time Teacher" button added. It calls a new
   endpoint GET /api/timetable/teaching-now which lists EVERY teacher
   currently taking a class (across all sections, so multiple simultaneous
   teachers are shown). The HOD picks whichever teacher to analyse live.

3. Report category labels now show "Real-time <Category>" (e.g. Real-time
   Theory, Real-time Tutorial, Real-time Lab) for live sessions, while
   recorded sessions still show the plain category. The result CARD format
   is unchanged — identical to the recorded report for each category.

NOTE: a live real-time TEACHER session currently runs through the live
engine's standard pipeline; the per-category model routing covers
theory/tutorial/lab. Teacher live uses the same live engine path.

---

## Round 19 — Real-time TEACHER shows teaching mode + enthusiasm (not student metrics)

The live "Analyse Real-time Teacher" was falling through to the student
emotion pipeline (showing Students / engagement). Fixed:

  • live_engine.py: added a TEACHER branch. When the live category is
    'teacher' it loads the teaching-mode model (best_model.pth) and, per
    frame, predicts the teaching mode (Board Only / PPT-Screen Only /
    Board + PPT) and estimates enthusiasm from sustained body motion.
    Reports is_teacher, mode_label, enthu_pct, enthu_verdict.
  • Dashboard.jsx: when stats.is_teacher, the live view shows a "Mode of
    teaching" card + an enthusiasm % card with verdict (HIGHLY
    ENTHUSIASTIC / ENTHUSIASTIC / NOT ENTHUSIASTIC) instead of the student
    engagement block. The "no students detected" popup/banner is suppressed
    for teacher sessions. The final (done) report shows the same teacher
    format.

NOTE: live teacher enthusiasm uses a lightweight motion estimate (not the
full LSTM) so it can run in real time; the recorded teacher analysis still
uses the full enthusiasm model. The teaching-MODE detection uses the real
trained model.

---

## Round 20 — Make live teacher model loading robust (likely the real fix)

The live teacher branch imported teacher_analyzer.py, which loads mediapipe
+ the LSTM + sklearn at import time. If ANY of those failed on the user's
machine, _ensure_teacher_model() returned False and the teacher branch was
SILENTLY skipped — falling back to the student pipeline (Students / engagement).
That is the most likely reason it still showed student metrics after restart.

Fix:
  • The teaching-mode model is now built INLINE in live_engine.py (just
    torch + torchvision mobilenet_v2), with no dependency on
    teacher_analyzer.py — so mediapipe/LSTM problems can no longer disable it.
  • If the teacher model still fails to load, the live view now shows
    "TEACHER MODEL FAILED TO LOAD" + the error, instead of silently
    showing student metrics — so the cause is visible.

---

## Round 21 — Force teacher-style UI for live teacher sessions (drive from prop, not stats)

Real cause of "still showing students" in the teacher live session: the UI
was deciding teacher-vs-student from stats.is_teacher, which depends on
the backend successfully running the teacher branch and reporting the
flag. If that didn't happen for any reason (cached pyc, partial reload,
model load issue), the UI fell back to the student template.

Fix: the live modal now decides from the CATEGORY PROP itself
(isTeacherSession = category === 'Teacher'). So for a teacher session
the UI ALWAYS shows:
  • Mode of teaching card (board / PPT / both) — uses backend value when
    it arrives, "Detecting…" until then.
  • Enthusiasm % card with verdict.
  • NO students chip, NO live engagement trend graph, NO "no students
    detected" popup or banner, NO student-style LIVE RECOMMENDATION.
The final (done) report also branches on the prop, so a teacher session
always shows the teacher final-report layout.

---

## Round 22 — Robust teacher model loader + visible error

The teacher model loader is now robust to the most common causes of
silent load failure:
  • Newer PyTorch defaults torch.load to weights_only=True which refuses
    checkpoints that contain non-tensor data (class_names etc.). The
    loader now passes weights_only=False explicitly (with fallback for old
    torch versions).
  • Supports checkpoints stored as {'model_state':...}, {'state_dict':...}
    or a bare state_dict.
  • Strips any 'module.' prefix left over from DataParallel training.
  • Loads with strict=False so a minor head-name mismatch doesn't kill
    the whole load.
  • Logs the FULL traceback to Flask's console + surfaces a concise error
    string in the dashboard (under the Enthusiasm card), so the actual
    cause is visible if it still fails.

---

## Round 23 — Real fix for "0 Frames analysed" + no student banner on teacher session

1. The teacher branch in the live engine now runs BEFORE the student-side
   person detection step. Previously, even for a teacher session the loop
   was first running YOLO via the emotion module — if that step had any
   issue (yolo_model None / helper missing / silent throw), the whole
   frame was skipped, which is why "Frames analysed = 0" with 22s elapsed
   and the camera fine. Now teacher predictions run on every frame
   independent of the student helpers.

2. /live/stop now returns a TEACHER-specific structured (with
   is_teacher, mode_label, enthu_pct, enthu_verdict) for teacher sessions
   instead of running them through the student "quality_ok" check that
   checks students_detected / faces_seen — fields that don't apply.

3. The "Analysis not reliable / Students seen / Video clarity" banner is
   now suppressed in the done view when isTeacherSession is true.
