"""
main.py  –  Classroom AI  ·  Menu-Based Launcher
==================================================
Options
  1. Teacher   → teacher_analyzer.py  (picks a random teacher video)
  2. Theory    → inference.py wrapper  (picks a random theory*.mp4)
  3. Tutorial  → inference.py wrapper  (picks a random non-theory video)
  4. Lab       → test.py               (picks a random lab-dataset video)

No existing file has been changed.
"""

import os
import sys
import glob
import random
import subprocess

# ── Base paths (everything is relative to this file) ──────────────────────────
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
EMOTION_DIR   = os.path.join(BASE_DIR, "all_int_die")
VIDEOS_DIR    = os.path.join(EMOTION_DIR, "videos")
LAB_DIR       = os.path.join(BASE_DIR, "lab")
LAB_DATASET   = os.path.join(LAB_DIR, "lab dataset")
TEACHER_DIR   = os.path.join(BASE_DIR, "teacher_code")

VIDEO_EXTS    = ("*.mp4", "*.avi", "*.mov", "*.mkv",
                 "*.MP4", "*.AVI", "*.MOV", "*.MKV")


# ── Helper: pick a random video from a folder, with optional name filter ───────
def pick_video(folder, name_check=None):
    """
    name_check: a function that receives the lowercased filename and
                returns True if that file should be included.
    """
    all_videos = []
    for ext in VIDEO_EXTS:
        all_videos.extend(glob.glob(os.path.join(folder, ext)))

    if name_check is not None:
        all_videos = [v for v in all_videos
                      if name_check(os.path.basename(v).lower())]

    if not all_videos:
        return None

    chosen = random.choice(all_videos)
    print(f"\n  [INFO] Video selected  : {os.path.basename(chosen)}")
    print(f"  [INFO] Full path       : {chosen}")
    return chosen


# ── Option 1 : Teacher ─────────────────────────────────────────────────────────
def run_teacher():
    print("\n" + "=" * 56)
    print("   TEACHER ANALYSIS")
    print("=" * 56)
    # teacher_analyzer.py auto-picks a random video from the 'teacher' subfolder.
    # We just run it from inside teacher_code/ so its relative paths work.
    result = subprocess.run(
        [sys.executable, "teacher_analyzer.py"],
        cwd=TEACHER_DIR
    )
    if result.returncode != 0:
        print("\n  [WARN] teacher_analyzer.py exited with code", result.returncode)


# ── Option 2 : Theory ──────────────────────────────────────────────────────────
def run_theory():
    print("\n" + "=" * 56)
    print("   THEORY  –  Student Attention Analysis")
    print("=" * 56)

    # Theory videos are named theory*.mp4
    video = pick_video(VIDEOS_DIR,
                       name_check=lambda n: n.startswith("theory"))
    if video is None:
        print(f"\n  [ERROR] No theory videos found in: {VIDEOS_DIR}")
        return

    result = subprocess.run(
        [sys.executable, "run_video.py", "--video", video],
        cwd=EMOTION_DIR
    )
    if result.returncode != 0:
        print("\n  [WARN] run_video.py exited with code", result.returncode)


# ── Option 3 : Tutorial ────────────────────────────────────────────────────────
def run_tutorial():
    print("\n" + "=" * 56)
    print("   TUTORIAL  –  Student Attention Analysis")
    print("=" * 56)

    # Tutorial videos are any non-theory videos (e.g. gemini_generated_*.mp4)
    video = pick_video(VIDEOS_DIR,
                       name_check=lambda n: not n.startswith("theory"))
    if video is None:
        print(f"\n  [ERROR] No tutorial videos found in: {VIDEOS_DIR}")
        return

    result = subprocess.run(
        [sys.executable, "run_video.py", "--video", video],
        cwd=EMOTION_DIR
    )
    if result.returncode != 0:
        print("\n  [WARN] run_video.py exited with code", result.returncode)


# ── Option 4 : Lab ─────────────────────────────────────────────────────────────
def run_lab():
    print("\n" + "=" * 56)
    print("   LAB BEHAVIOR ANALYSIS")
    print("=" * 56)

    # lab/test.py accepts --video and --lab_dataset flags
    video = pick_video(LAB_DATASET)
    if video is None:
        print(f"\n  [ERROR] No lab videos found in: {LAB_DATASET}")
        return

    result = subprocess.run(
        [sys.executable, "test.py", "--video", video],
        cwd=LAB_DIR
    )
    if result.returncode != 0:
        print("\n  [WARN] test.py exited with code", result.returncode)


# ── Menu ───────────────────────────────────────────────────────────────────────
MENU = """
╔══════════════════════════════════════════════════════╗
║          CLASSROOM AI  –  ANALYSIS SYSTEM            ║
╠══════════════════════════════════════════════════════╣
║  1.  Teacher   (teaching mode + enthusiasm)          ║
║  2.  Theory    (student attention on theory video)   ║
║  3.  Tutorial  (student attention on tutorial video) ║
║  4.  Lab       (lab behavior – focused / distracted) ║
║  0.  Exit                                            ║
╚══════════════════════════════════════════════════════╝
"""

ACTIONS = {
    "1": run_teacher,
    "2": run_theory,
    "3": run_tutorial,
    "4": run_lab,
}


def main():
    while True:
        print(MENU)
        choice = input("  Enter your choice (0-4): ").strip()

        if choice == "0":
            print("\n  Goodbye!\n")
            break
        elif choice in ACTIONS:
            ACTIONS[choice]()
            input("\n  Press Enter to return to the menu…")
        else:
            print("\n  [!] Invalid choice — please enter a number between 0 and 4.")


if __name__ == "__main__":
    main()
