"""
annotated_viewer.py
===================
Shared helper used by every analysis script (theory / tutorial / lab /
teacher).

Purpose
-------
The dashboard output (percentages, verdict, recommendation) stays exactly
as it is. Separately, the *annotated* video — the one with the bounding
boxes and labels drawn on it — is opened in its OWN operating-system
window, which means it gets its OWN entry in the taskbar.

It is NOT a popup layered over the dashboard. The user sees it only if
they click that taskbar entry. If they never open it, it sits there
quietly and does not interrupt anything.

How it works
------------
After an analysis finishes, the script calls `open_annotated(path)`.
That function spawns the system's default video player as a *detached*
background process (its own taskbar button) and returns immediately, so
the analysis script can finish and return its JSON to the dashboard
without waiting.

Disable it
----------
Set the environment variable  SHOW_ANNOTATED=0  to skip opening the
window entirely (useful for headless servers / automated runs).
"""

import os
import sys
import subprocess


def _enabled() -> bool:
    """Annotated-window opening is ON by default; SHOW_ANNOTATED=0 turns it off."""
    return os.environ.get("SHOW_ANNOTATED", "1").strip() not in ("0", "false", "False", "")


def open_annotated(video_path: str) -> bool:
    """
    Open `video_path` in a separate OS window (its own taskbar entry).

    Returns True if the open command was issued, False otherwise.
    Never raises — a failure to open the viewer must never break the
    analysis itself.
    """
    if not _enabled():
        print("[ANNOTATED] SHOW_ANNOTATED=0 — skipping annotated video window.")
        return False

    if not video_path or not os.path.isfile(video_path):
        print(f"[ANNOTATED] Annotated video not found, nothing to open: {video_path}")
        return False

    video_path = os.path.abspath(video_path)
    print("[ANNOTATED] Opening annotated video in a separate window:")
    print(f"[ANNOTATED]   {video_path}")
    print("[ANNOTATED]   (look for a new entry in your taskbar — it will "
          "not pop up over the dashboard)")

    try:
        if sys.platform.startswith("win"):
            # os.startfile launches the file in the default player as a
            # brand-new, fully detached process => its own taskbar button.
            os.startfile(video_path)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            # -n forces a new instance so it becomes its own window.
            subprocess.Popen(
                ["open", "-n", video_path],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        else:
            # Linux — xdg-open hands off to the default player, detached.
            subprocess.Popen(
                ["xdg-open", video_path],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        return True
    except Exception as exc:  # pragma: no cover — viewer is best-effort
        print(f"[ANNOTATED] Could not open the annotated video automatically: {exc}")
        print(f"[ANNOTATED] You can still open it manually at: {video_path}")
        return False
