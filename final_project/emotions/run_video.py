"""
run_video.py  –  Thin wrapper around inference.py
===================================================
Accepts --video <path> and passes it straight into
inference.run(), which already handles everything.

Why this file exists:
    inference.py has no --video argument; it always
    picks a random video from a hardcoded folder.
    This wrapper lets main.py choose the video first
    and then hand it to the existing run() function,
    without touching inference.py at all.

Usage (called automatically by main.py):
    python run_video.py --video /path/to/video.mp4
"""

import argparse
import os
import sys

# Make sure Python can find inference.py (same folder as this file)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from inference import run   # import existing run() — unchanged


def main():
    parser = argparse.ArgumentParser(
        description="Run inference.py on a specific video file."
    )
    parser.add_argument(
        "--video", required=True,
        help="Full path to the .mp4 / .avi / .mov video file to analyse."
    )
    args = parser.parse_args()

    if not os.path.isfile(args.video):
        print(f"[ERROR] Video file not found: {args.video}")
        sys.exit(1)

    print(f"[INFO] Starting inference on: {os.path.basename(args.video)}")
    run(args.video)   # calls the real run() from inference.py


if __name__ == "__main__":
    main()
