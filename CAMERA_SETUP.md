# Real-Time Camera Setup Guide

The "Analyse Current Class" button can now capture live video and run the
analysis on it. This guide explains how to set that up.

---

## How it works

When you click **Analyse Current Class**, the frontend sends `source: camera`
to the Flask API. Flask then tries, in this order:

1. **Live camera** — a USB webcam, or your phone running Iriun / DroidCam.
   It records a short clip (default 15 seconds) and analyses it.
2. **Watch folder** — if no live camera is found, it uses the newest video
   you copied into `flask_api/camera_input/` (for standalone recorders like
   a button spy camera).
3. **Sample video** — if neither is available, it falls back to the bundled
   sample videos so the demo never breaks.

The normal "Analyse" button on a subject card is unaffected — it always uses
the sample videos. Only the real-time button uses the camera.

---

## Option 1: Phone as camera (recommended, free)

### Install Iriun
- Phone: install **Iriun Webcam** from Play Store / App Store.
- Laptop: download **Iriun Webcam for Windows** from iriun.com and install.

### Connect (USB method — most reliable)
1. On the phone: enable Developer Options (Settings → About phone → tap
   "Build number" 7 times), then turn on **USB debugging**.
2. Plug the phone into the laptop with a USB cable.
3. Open Iriun on both the phone and the laptop. The laptop window shows the
   phone's camera feed.

### Find the camera index
A laptop with a built-in webcam usually has the built-in camera at index 0
and the phone at index 1. To check:

1. Start Flask (`cd flask_api && python app.py`).
2. Open this URL in a browser: `http://localhost:8000/camera/test`
3. It lists which indices deliver a frame. Note the index that is your phone.

### Start Flask pointed at the phone
If the phone is index 1:

**Windows Command Prompt:**
```
cd flask_api
set CAMERA_INDEX=1
python app.py
```

**Windows PowerShell:**
```
cd flask_api
$env:CAMERA_INDEX=1
python app.py
```

If the phone is index 0 (e.g. a desktop with no built-in webcam), you don't
need to set anything — 0 is the default.

---

## Option 2: USB webcam

Plug in any UVC USB webcam. It's usually index 0 on a desktop, or index 1 on
a laptop (built-in camera takes 0). Use `/camera/test` to confirm, then start
Flask with the right `CAMERA_INDEX` as shown above.

---

## Option 3: Button / spy camera (record-only devices)

These cameras record to a microSD card and have no live feed, so they can't
do true live capture. Use the watch folder instead:

1. Record the class with the button camera.
2. Put the microSD card in the laptop.
3. Copy the recording into `flask_api/camera_input/`.
4. Click **Analyse Current Class** — the newest file in that folder is used.

A file in `camera_input/` is only treated as "fresh" if modified within the
last 2 hours, so an old leftover recording is not picked up by mistake.

---

## Settings (environment variables)

Set these before starting Flask if you need to change the defaults:

| Variable | Default | Meaning |
|----------|---------|---------|
| `CAMERA_INDEX` | `0` | Which camera OpenCV opens |
| `CAMERA_RECORD_SECONDS` | `15` | Length of the live clip recorded |
| `CAMERA_FRESH_MINUTES` | `120` | How recent a watch-folder file must be |

Example — record a 30-second clip from camera index 1:
```
set CAMERA_INDEX=1
set CAMERA_RECORD_SECONDS=30
python app.py
```

---

## Helper endpoints

- `http://localhost:8000/camera/test` — probes camera indices 0–3 and shows
  which ones work. Use this to find your phone's index.
- `http://localhost:8000/camera/status` — shows what a real-time request
  would use right now (live camera / watch-folder recording / sample).

---

## Install note

The camera feature uses OpenCV. It is now in `requirements.txt`, so:
```
cd flask_api
pip install -r requirements.txt
```
This installs `opencv-python` along with Flask. If OpenCV is missing, the
system simply skips the live-camera step and falls back to the watch folder
or sample videos — it never crashes.

---

## Demo checklist

1. Connect the phone (Iriun, USB) — confirm the feed shows on the laptop.
2. `cd flask_api` → set `CAMERA_INDEX` if needed → `python app.py`.
3. Open `http://localhost:8000/camera/status` — confirm
   `"source_that_would_be_used": "live-camera"`.
4. Start the Node backend and the React frontend as usual.
5. Log in as a teacher → click **Analyse Current Class**.
6. The modal shows "Capturing from camera & analysing…", records the clip,
   runs the pipeline, and shows the result.

---

## Live Real-Time Mode (Start / Stop)

The "Analyse Current Class" button now runs **true real-time analysis** with
Start and Stop controls — it analyses the live camera feed continuously
rather than recording a fixed clip first.

### How it works

1. Click **Analyse Current Class** — a modal opens with a **Start** button.
2. Click **Start Live Analysis** — the camera opens and the AI begins
   analysing the live feed.
3. The engagement number, student counts, dominant emotion and a live
   teaching recommendation **refresh on screen every ~2 seconds**.
4. There is **no time limit** — the session runs until you click **Stop**.
5. Click **Stop & Save Analysis** — the final numbers are saved to history
   and a recommendation is sent to the HOD, exactly like a normal analysis.

### Honest note on latency

The numbers refresh roughly every 2 seconds, but the *analysis itself*
runs as fast as your CPU allows. On a normal laptop without a GPU, the
per-frame pipeline (YOLOv8 + MobileNetV2 + MediaPipe) processes a few
frames per second. The engagement figure is a rolling result over the
frames processed so far — so it becomes more stable the longer the
session runs. This is genuine live analysis of the camera feed, not a
recording being checked afterward.

### Endpoints (for reference)

- `POST /live/start`  — begins a live session (body: `{"category": "Lab"}`)
- `GET  /live/stats`  — current rolling numbers (the dashboard polls this)
- `POST /live/stop`   — ends the session and returns the final result

### Lab / Theory / Tutorial

The live session is told which category it is (from the timetable slot),
so a lab slot is recorded and saved as a lab session. Lab results are
normalised the same way recorded-lab analysis is.
