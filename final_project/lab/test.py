"""
test.py
=======
Testing pipeline for Classroom Lab Behavior Analysis.

Features:
    ✓ AUTO-SELECTS a random video from the lab dataset folder on startup
    ✓ YOLOv8n person detection (falls back to full-frame classification if YOLO unavailable)
    ✓ Per-person bounding box + "Focused" / "Distracted" label
    ✓ Live preview window (optional, disable with --no_display)
    ✓ Saves annotated output video to output/<input_name>_result.mp4
    ✓ Prints a detailed terminal summary report

Usage:
    # Run immediately — picks a RANDOM video from the lab dataset folder:
    python test.py

    # Specify a custom video instead:
    python test.py --video "path/to/video.mp4"

    # Change the lab dataset folder (default: C:\\Users\\Chithra\\Downloads\\lab dataset):
    python test.py --lab_dataset "D:\\my\\lab dataset"

    # Without live window (e.g. headless server):
    python test.py --no_display
"""

import os
import sys
import argparse
import random
import time
from pathlib import Path
from collections import defaultdict

import cv2
import numpy as np
import torch
from torchvision import transforms
from PIL import Image

from model import load_model
from utils import (draw_detection, draw_count_overlay,
                   CLASS_NAMES, CLASS_COLORS, ensure_dir)

# ─────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────

IMG_SIZE   = 224
CONFIDENCE = 0.45   # YOLO detection confidence threshold
IOU        = 0.45   # YOLO NMS IoU threshold

NORM_MEAN  = [0.485, 0.456, 0.406]
NORM_STD   = [0.229, 0.224, 0.225]

# Default path to the lab dataset folder
DEFAULT_LAB_DATASET = r"C:\Users\Chithra\Downloads\lab dataset"

_TRANSFORM = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(NORM_MEAN, NORM_STD),
])

VIDEO_EXTENSIONS = (".mp4", ".avi", ".mov", ".mkv", ".MP4", ".AVI", ".MOV", ".MKV")


# ─────────────────────────────────────────────────────────────────────────
# Random Video Selector
# ─────────────────────────────────────────────────────────────────────────

def pick_random_video(lab_dataset_path: str) -> str:
    """
    Randomly select a video file from the lab dataset folder.

    Args:
        lab_dataset_path : Path to the folder containing lab videos.

    Returns:
        Full path to the randomly selected video.

    Raises:
        SystemExit if the folder does not exist or contains no videos.
    """
    if not os.path.isdir(lab_dataset_path):
        print(f"[ERROR] Lab dataset folder not found: {lab_dataset_path}")
        print("        Update --lab_dataset to point to your video folder.")
        sys.exit(1)

    video_files = [
        os.path.join(lab_dataset_path, f)
        for f in os.listdir(lab_dataset_path)
        if f.lower().endswith(VIDEO_EXTENSIONS)
    ]

    if not video_files:
        print(f"[ERROR] No video files found in: {lab_dataset_path}")
        print(f"        Expected extensions: {VIDEO_EXTENSIONS}")
        sys.exit(1)

    chosen = random.choice(video_files)
    print(f"[INFO] Lab dataset folder : {lab_dataset_path}")
    print(f"[INFO] Available videos   : {len(video_files)}")
    print(f"[INFO] Randomly selected  : {Path(chosen).name}")
    return chosen


# ─────────────────────────────────────────────────────────────────────────
# Argument Parser
# ─────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(
        description="Test classroom behavior on a video — auto-picks from lab dataset"
    )
    p.add_argument("--video", default=None,
                   help="Path to a specific input video. "
                        "If omitted, a random video is picked from --lab_dataset.")
    p.add_argument("--lab_dataset", default=DEFAULT_LAB_DATASET,
                   help=f"Folder containing lab videos for random selection "
                        f"(default: {DEFAULT_LAB_DATASET})")
    p.add_argument("--model",   default="output/best_model.pth",
                   help="Path to trained .pth model")
    p.add_argument("--output_dir", default="output",
                   help="Directory for output video and report")
    p.add_argument("--frame_skip", type=int, default=2,
                   help="Process 1 out of every N frames (1 = all frames)")
    p.add_argument("--no_display", action="store_true",
                   help="Disable live preview window")
    p.add_argument("--conf", type=float, default=CONFIDENCE,
                   help="YOLO detection confidence threshold")
    return p.parse_args()


# ─────────────────────────────────────────────────────────────────────────
# YOLO Loader (graceful fallback if ultralytics not installed)
# ─────────────────────────────────────────────────────────────────────────

def try_load_yolo(conf: float = CONFIDENCE):
    """
    Try to load YOLOv8n for person detection.
    Returns the model if successful, None otherwise.
    """
    try:
        from ultralytics import YOLO
        print("[INFO] Loading YOLOv8n for person detection…")
        _here = os.path.dirname(os.path.abspath(__file__))
        _yp = os.path.join(_here, "yolov8n.pt")
        yolo = YOLO(_yp if os.path.isfile(_yp) else "yolov8n.pt")
        yolo.overrides["conf"]    = conf
        yolo.overrides["iou"]     = IOU
        yolo.overrides["classes"] = [0]  # class 0 = person in COCO
        print("[INFO] YOLOv8n loaded successfully.")
        return yolo
    except ImportError:
        print("[WARNING] 'ultralytics' not installed. "
              "Falling back to whole-frame classification.\n"
              "          Install with: pip install ultralytics")
        return None
    except Exception as e:
        print(f"[WARNING] YOLO load failed ({e}). Using fallback.")
        return None


# ─────────────────────────────────────────────────────────────────────────
# Inference Helpers
# ─────────────────────────────────────────────────────────────────────────

def classify_region(model, device, frame_bgr: np.ndarray,
                     box: tuple = None) -> tuple:
    """
    Classify a region of a frame.

    Args:
        model     : Loaded PyTorch classifier.
        device    : torch.device.
        frame_bgr : Full frame (BGR numpy array).
        box       : Optional (x1, y1, x2, y2) crop region.
                    If None, classify the entire frame.

    Returns:
        (class_id, confidence)
            class_id = 0 → Focused
            class_id = 1 → Distracted
    """
    if box is not None:
        x1, y1, x2, y2 = [max(0, int(v)) for v in box]
        crop = frame_bgr[y1:y2, x1:x2]
        if crop.size == 0:
            crop = frame_bgr
    else:
        crop = frame_bgr

    img  = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
    inp  = _TRANSFORM(img).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = model(inp)
        probs  = torch.softmax(logits, dim=1)[0]
        cls_id = probs.argmax().item()
        conf   = probs[cls_id].item()

    return cls_id, conf


def detect_persons_yolo(yolo_model, frame_bgr: np.ndarray) -> list:
    """
    Run YOLOv8 on a frame and return person bounding boxes.

    Returns:
        List of (x1, y1, x2, y2) tuples.
    """
    results = yolo_model(frame_bgr, verbose=False)
    boxes   = []
    for r in results:
        for box in r.boxes:
            cls = int(box.cls[0])
            if cls == 0:  # person
                x1, y1, x2, y2 = box.xyxy[0].cpu().tolist()
                boxes.append((x1, y1, x2, y2))
    return boxes


def fallback_grid_detection(frame_bgr: np.ndarray,
                              grid: tuple = (2, 3)) -> list:
    """
    When YOLO is unavailable, split the frame into a grid and treat
    each cell as a separate 'person region'.

    Args:
        grid : (rows, cols) – e.g. (2, 3) = 6 cells for a lab with 6 seats.

    Returns:
        List of (x1, y1, x2, y2) tuples.
    """
    h, w = frame_bgr.shape[:2]
    rows, cols = grid
    cell_h = h // rows
    cell_w = w // cols
    boxes  = []
    for r in range(rows):
        for c in range(cols):
            x1 = c * cell_w
            y1 = r * cell_h
            x2 = x1 + cell_w
            y2 = y1 + cell_h
            boxes.append((x1, y1, x2, y2))
    return boxes


# ─────────────────────────────────────────────────────────────────────────
# Summary Report
# ─────────────────────────────────────────────────────────────────────────

def print_summary_report(video_path: str,
                          frame_stats: dict,
                          total_frames_processed: int,
                          elapsed_seconds: float) -> None:
    """
    Print a formatted terminal summary report after processing.

    Args:
        video_path             : Input video path string.
        frame_stats            : dict with 'focused' and 'distracted' detection counts.
        total_frames_processed : Number of frames actually processed.
        elapsed_seconds        : Total processing time.
    """
    focused_count    = frame_stats["focused"]
    distracted_count = frame_stats["distracted"]
    total_detected   = focused_count + distracted_count

    if total_detected > 0:
        focused_pct    = 100.0 * focused_count    / total_detected
        distracted_pct = 100.0 * distracted_count / total_detected
    else:
        focused_pct = distracted_pct = 0.0

    width = 62
    print("\n" + "═" * width)
    print("   📊  FINAL ANALYSIS REPORT")
    print("═" * width)
    print(f"  Input video     : {Path(video_path).name}")
    print(f"  Processing time : {elapsed_seconds:.1f}s  "
          f"({total_frames_processed / max(elapsed_seconds, 1):.1f} fps)")
    print("─" * width)
    print(f"  Total student frames detections : {total_detected/10}")
    print(f"  ├─ Focused frames               : {focused_count/10}")
    print(f"  └─ Distracted frames            : {distracted_count/10}")
    print("─" * width)
    print(f"  Behavior Distribution:")

    # ASCII bar chart
    bar_width = 30
    f_bar = "█" * int(bar_width * focused_pct    / 100)
    d_bar = "█" * int(bar_width * distracted_pct / 100)
    print(f"  Focused    [{f_bar:<{bar_width}}]  {focused_pct:5.1f}%")
    print(f"  Distracted [{d_bar:<{bar_width}}]  {distracted_pct:5.1f}%")
    print("─" * width)

    # Insight
    if focused_pct > 60:
        verdict = 'Students are on-task and actively working on their lab assignments. Excellent lab session!'
    elif distracted_pct > 60:
        verdict = 'Students appear off-task during this lab session. A structured check-in or guided instructions may help improve focus.'
    else:
        verdict = 'The lab session shows a balanced mix of focused and distracted students. Monitoring individual workstations may help.'
    print(f"  Insight: {verdict}")
    print("═" * width + "\n")


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main():
    args   = parse_args()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[INFO] Device: {device}")

    # ── Resolve video path ──────────────────────────────────────────────────
    if args.video:
        # User explicitly provided a video
        video_path = args.video
        if not os.path.isfile(video_path):
            print(f"[ERROR] Video not found: {video_path}")
            sys.exit(1)
        print(f"[INFO] Using specified video: {video_path}")
    else:
        # Auto-pick a random video from the lab dataset folder
        print("\n[INFO] No --video specified. Picking randomly from lab dataset…")
        video_path = pick_random_video(args.lab_dataset)

    # ── Load classifier ─────────────────────────────────────────────────────
    if not os.path.isfile(args.model):
        print(f"[ERROR] Model file not found: {args.model}")
        print("        Train the model first:  python train.py --dataset_root <path>")
        sys.exit(1)

    classifier = load_model(args.model, num_classes=2, device=device)

    # ── Load YOLO (optional) ────────────────────────────────────────────────
    yolo = try_load_yolo(conf=args.conf)

    # ── Open video ──────────────────────────────────────────────────────────
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open video: {video_path}")
        sys.exit(1)

    fps    = cap.get(cv2.CAP_PROP_FPS) or 25
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"[INFO] Video     : {video_path}")
    print(f"[INFO] Resolution: {width}×{height}  |  FPS: {fps:.1f}  |  Frames: {total}")

    # ── Output video writer ─────────────────────────────────────────────────
    ensure_dir(args.output_dir)
    out_name = Path(video_path).stem + "_result.mp4"
    out_path = os.path.join(args.output_dir, out_name)
    fourcc   = cv2.VideoWriter_fourcc(*"mp4v")
    writer   = cv2.VideoWriter(out_path, fourcc, fps, (width, height))

    # ── Processing loop ─────────────────────────────────────────────────────
    frame_stats = defaultdict(int)   # {"focused": N, "distracted": M}
    frame_idx   = 0
    processed   = 0
    t_start     = time.time()

    # Last known detections (for frames we skip — keeps boxes visible)
    last_detections = []  # list of (box, class_id, conf)

    print(f"\n[INFO] Starting analysis (frame_skip={args.frame_skip})…")
    print("       Press  Q  in the preview window to quit early.\n")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_idx += 1

        # ── Only run inference every `frame_skip` frames ──
        if frame_idx % args.frame_skip == 0:
            processed += 1

            # Detect persons
            if yolo is not None:
                boxes = detect_persons_yolo(yolo, frame)
            else:
                boxes = fallback_grid_detection(frame, grid=(2, 3))

            # If no person detected, classify full frame as single region
            if not boxes:
                boxes = [(0, 0, width, height)]

            new_detections = []
            for box in boxes:
                cls_id, conf = classify_region(classifier, device, frame, box)
                new_detections.append((box, cls_id, conf))
                frame_stats[CLASS_NAMES[cls_id].lower()] += 1

            last_detections = new_detections

        # ── Draw annotations on every frame ──
        focused_n    = 0
        distracted_n = 0

        for box, cls_id, conf in last_detections:
            draw_detection(frame, box, cls_id, conf)
            if cls_id == 0:
                focused_n += 1
            else:
                distracted_n += 1

        draw_count_overlay(frame, focused_n, distracted_n)

        # Frame number watermark (bottom-right)
        cv2.putText(frame, f"Frame {frame_idx}",
                    (width - 140, height - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    (180, 180, 180), 1, cv2.LINE_AA)

        writer.write(frame)

        # ── Live display ──
        if not args.no_display:
            # Scale down if frame is very large (keeps preview responsive)
            display = frame
            if width > 1280:
                scale   = 1280 / width
                display = cv2.resize(frame, (1280, int(height * scale)))
            cv2.imshow("Classroom Behavior Analysis  [Q = quit]", display)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                print("\n[INFO] User quit early.")
                break

        # Progress print every 100 processed frames
        if processed % 100 == 0 and processed > 0:
            pct = 100 * frame_idx / max(total, 1)
            print(f"  … {frame_idx}/{total} frames  ({pct:.0f}%)")

    elapsed = time.time() - t_start

    cap.release()
    writer.release()
    if not args.no_display:
        cv2.destroyAllWindows()

    print(f"\n[INFO] Output video saved → {out_path}")

    # ── Terminal Summary Report ─────────────────────────────────────────────
    print_summary_report(video_path, frame_stats, processed, elapsed)


if __name__ == "__main__":
    main()
