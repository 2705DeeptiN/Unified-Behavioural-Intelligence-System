"""
dataset_loader.py
=================
Handles video frame extraction and dataset creation for the
Classroom Lab Behavior Analysis project.

Labels:
    focused     → 0
    distracted  → 1
"""

import os
import cv2
import numpy as np
from pathlib import Path
from torch.utils.data import Dataset
from torchvision import transforms
from PIL import Image

# ─────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────
IMG_SIZE   = 224          # MobileNetV2 default input size
FRAME_STEP = 10           # Extract 1 frame every N frames (speed vs. coverage trade-off)
MIN_FRAMES = 5            # Minimum frames to extract per video (handles very short clips)

CLASS_MAP = {
    "focused":     0,
    "distracted":  1,
}
CLASS_NAMES = ["Focused", "Distracted"]   # index → human label


# ─────────────────────────────────────────────
# Frame Extraction
# ─────────────────────────────────────────────

def extract_frames_from_video(video_path: str,
                               output_dir: str,
                               frame_step: int = FRAME_STEP,
                               img_size: int = IMG_SIZE) -> int:
    """
    Extract frames from a single video and save them as JPEG images.

    Args:
        video_path  : Path to the source .mp4 (or any cv2-readable) file.
        output_dir  : Folder where extracted frames will be saved.
        frame_step  : Save one frame every `frame_step` frames.
        img_size    : Resize each frame to (img_size × img_size).

    Returns:
        Number of frames actually saved.
    """
    os.makedirs(output_dir, exist_ok=True)
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print(f"  [WARNING] Could not open video: {video_path}")
        return 0

    total_frames  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    saved_count   = 0
    frame_idx     = 0

    # If video is very short, reduce frame_step so we still get MIN_FRAMES
    effective_step = max(1, min(frame_step, total_frames // MIN_FRAMES)) if total_frames > 0 else frame_step

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % effective_step == 0:
            # Resize to square
            frame_resized = cv2.resize(frame, (img_size, img_size))
            # Build filename: <video_stem>_frame_<idx>.jpg
            video_stem  = Path(video_path).stem
            frame_name  = f"{video_stem}_frame_{frame_idx:05d}.jpg"
            save_path   = os.path.join(output_dir, frame_name)
            cv2.imwrite(save_path, frame_resized)
            saved_count += 1

        frame_idx += 1

    cap.release()
    return saved_count


def extract_all_videos(dataset_root: str,
                        frames_root: str,
                        frame_step: int = FRAME_STEP,
                        img_size: int = IMG_SIZE) -> dict:
    """
    Walk through dataset_root, find focused/ and distracted/ sub-folders,
    extract frames from every video, and store them under frames_root
    with the same sub-folder hierarchy.

    dataset_root/
        focused/      ← videos
        distracted/   ← videos

    frames_root/
        focused/      ← extracted frames
        distracted/   ← extracted frames

    Args:
        dataset_root : Root folder containing 'focused' and 'distracted' sub-dirs.
        frames_root  : Destination root for extracted frames.
        frame_step   : Step between extracted frames.
        img_size     : Frame resize dimension.

    Returns:
        dict with keys 'focused' and 'distracted', values = frame counts.
    """
    stats = {"focused": 0, "distracted": 0}

    for class_name in CLASS_MAP:
        class_video_dir  = os.path.join(dataset_root, class_name)
        class_frames_dir = os.path.join(frames_root,  class_name)

        if not os.path.isdir(class_video_dir):
            # Try capital-case variant (e.g. "Focused" / "Distracted")
            class_video_dir = os.path.join(dataset_root, class_name.capitalize())
            if not os.path.isdir(class_video_dir):
                print(f"  [WARNING] Folder not found: {class_video_dir}. Skipping.")
                continue

        video_files = [
            f for f in os.listdir(class_video_dir)
            if f.lower().endswith((".mp4", ".avi", ".mov", ".mkv"))
        ]

        print(f"\n[INFO] Class '{class_name}': found {len(video_files)} videos")

        for vf in sorted(video_files):
            video_path = os.path.join(class_video_dir, vf)
            out_dir    = os.path.join(class_frames_dir, Path(vf).stem)
            n = extract_frames_from_video(video_path, out_dir, frame_step, img_size)
            print(f"       {vf:30s}  →  {n:4d} frames")
            stats[class_name] += n

    print(f"\n[INFO] Total frames extracted → focused: {stats['focused']}, distracted: {stats['distracted']}")
    return stats


# ─────────────────────────────────────────────
# PyTorch Dataset
# ─────────────────────────────────────────────

def build_file_list(frames_root: str) -> list:
    """
    Scan frames_root for all .jpg images and return a list of
    (image_path, label) tuples.
    """
    samples = []
    for class_name, label in CLASS_MAP.items():
        class_dir = os.path.join(frames_root, class_name)
        if not os.path.isdir(class_dir):
            continue
        # Frames are stored in per-video sub-folders
        for root, _, files in os.walk(class_dir):
            for fname in files:
                if fname.lower().endswith((".jpg", ".jpeg", ".png")):
                    samples.append((os.path.join(root, fname), label))
    return samples


def get_transforms(split: str = "train", img_size: int = IMG_SIZE):
    """
    Return torchvision transforms for training or validation/test.

    Training includes augmentation to combat overfitting on small datasets:
        - Random horizontal flip
        - Random rotation
        - Color jitter
        - Random erasing (simulates occlusion)

    Validation/test uses only resize + normalise (no augmentation).
    """
    # ImageNet normalisation (since we use pretrained MobileNetV2 weights)
    mean = [0.485, 0.456, 0.406]
    std  = [0.229, 0.224, 0.225]

    if split == "train":
        return transforms.Compose([
            transforms.Resize((img_size, img_size)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomRotation(degrees=15),
            transforms.ColorJitter(brightness=0.3, contrast=0.3,
                                   saturation=0.2, hue=0.05),
            transforms.ToTensor(),
            transforms.Normalize(mean, std),
            transforms.RandomErasing(p=0.2, scale=(0.02, 0.15)),
        ])
    else:  # "val" or "test"
        return transforms.Compose([
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean, std),
        ])


class FrameDataset(Dataset):
    """
    PyTorch Dataset that loads pre-extracted frames from disk.

    Args:
        samples   : List of (image_path, label) tuples.
        transform : torchvision transform pipeline.
    """

    def __init__(self, samples: list, transform=None):
        self.samples   = samples
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        img_path, label = self.samples[idx]
        image = Image.open(img_path).convert("RGB")
        if self.transform:
            image = self.transform(image)
        return image, label


# ─────────────────────────────────────────────
# Quick test / standalone usage
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    dataset_root = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\Chithra\Downloads\MINI PROJECT\dataset"
    frames_root  = os.path.join(os.path.dirname(dataset_root), "extracted_frames")

    print("=" * 60)
    print("  FRAME EXTRACTION")
    print("=" * 60)
    stats = extract_all_videos(dataset_root, frames_root)

    samples = build_file_list(frames_root)
    print(f"\n[INFO] Total samples in dataset: {len(samples)}")
