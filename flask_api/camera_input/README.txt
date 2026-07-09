CAMERA INPUT — WATCH FOLDER
===========================

This folder is for the standalone-recorder workflow (e.g. a button spy
camera that records to a microSD card and has no live feed).

When you click "Analyse Current Class" and NO live camera is detected,
the system uses the NEWEST video file dropped into this folder.

How to use it:
  1. Record your class with the button camera.
  2. Take the microSD card out and put it in the laptop.
  3. Copy the recording into this folder (flask_api/camera_input/).
  4. Click "Analyse Current Class" — the newest file here is analysed.

Note: a recording is only used if it was modified within the last
2 hours (configurable via CAMERA_FRESH_MINUTES) so an old leftover
file is not mistaken for a fresh class.

If a LIVE camera (USB webcam / phone via Iriun-DroidCam) is connected,
that takes priority and this folder is ignored.
