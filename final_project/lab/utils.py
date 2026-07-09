"""
utils.py
========
Shared helper utilities: plotting, metric reporting, overlay drawing.
"""

import os
import cv2
import numpy as np
import matplotlib
matplotlib.use("Agg")   # non-GUI backend (safe for servers / headless runs)
import matplotlib.pyplot as plt
import torch
from sklearn.metrics import (confusion_matrix, classification_report,
                              ConfusionMatrixDisplay)

CLASS_NAMES = ["Focused", "Distracted"]

# ─────────────────────────────────────────────────────────────────────────
# Training Curves
# ─────────────────────────────────────────────────────────────────────────

def plot_training_curves(train_losses: list,
                          val_losses: list,
                          train_accs: list,
                          val_accs: list,
                          save_path: str = "training_curves.png") -> None:
    """
    Save a 2-panel figure showing loss and accuracy curves.

    Args:
        train_losses / val_losses : Lists of per-epoch loss values.
        train_accs   / val_accs   : Lists of per-epoch accuracy values (0-100 %).
        save_path                 : Where to write the PNG.
    """
    epochs = range(1, len(train_losses) + 1)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5))
    fig.suptitle("Training Progress", fontsize=14, fontweight="bold")

    # ── Loss ──
    ax1.plot(epochs, train_losses, "b-o", label="Train Loss",
             linewidth=2, markersize=4)
    ax1.plot(epochs, val_losses,   "r-s", label="Val Loss",
             linewidth=2, markersize=4)
    ax1.set_title("Loss")
    ax1.set_xlabel("Epoch")
    ax1.set_ylabel("Cross-Entropy Loss")
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    # ── Accuracy ──
    ax2.plot(epochs, train_accs, "b-o", label="Train Acc",
             linewidth=2, markersize=4)
    ax2.plot(epochs, val_accs,   "r-s", label="Val Acc",
             linewidth=2, markersize=4)
    ax2.set_title("Accuracy")
    ax2.set_xlabel("Epoch")
    ax2.set_ylabel("Accuracy (%)")
    ax2.set_ylim(0, 105)
    ax2.legend()
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    os.makedirs(os.path.dirname(save_path) or ".", exist_ok=True)
    plt.savefig(save_path, dpi=120)
    plt.close()
    print(f"[INFO] Training curves saved → {save_path}")


# ─────────────────────────────────────────────────────────────────────────
# Confusion Matrix & Classification Report
# ─────────────────────────────────────────────────────────────────────────

def plot_confusion_matrix(y_true: list,
                           y_pred: list,
                           save_path: str = "confusion_matrix.png") -> None:
    """Save a labelled confusion matrix image."""
    cm  = confusion_matrix(y_true, y_pred)
    disp = ConfusionMatrixDisplay(confusion_matrix=cm,
                                   display_labels=CLASS_NAMES)
    fig, ax = plt.subplots(figsize=(6, 5))
    disp.plot(ax=ax, colorbar=False, cmap="Blues")
    ax.set_title("Confusion Matrix", fontsize=13, fontweight="bold")
    plt.tight_layout()
    os.makedirs(os.path.dirname(save_path) or ".", exist_ok=True)
    plt.savefig(save_path, dpi=120)
    plt.close()
    print(f"[INFO] Confusion matrix saved → {save_path}")


def print_classification_report(y_true: list, y_pred: list) -> None:
    """Print a full precision / recall / F1 report to stdout."""
    print("\n" + "=" * 60)
    print("  CLASSIFICATION REPORT")
    print("=" * 60)
    print(classification_report(y_true, y_pred,
                                 target_names=CLASS_NAMES, digits=4))


# ─────────────────────────────────────────────────────────────────────────
# Video Overlay Helpers
# ─────────────────────────────────────────────────────────────────────────

# Colour palette for each class (BGR)
CLASS_COLORS = {
    0: (255, 140,   0),   # Orange  → Focused
    1: (  0,  60, 220),   # Blue    → Distracted
}

def draw_detection(frame: np.ndarray,
                   box: tuple,
                   class_id: int,
                   confidence: float = None) -> np.ndarray:
    """
    Draw a bounding box and label on a frame (in-place).

    Args:
        frame      : BGR numpy array.
        box        : (x1, y1, x2, y2) pixel coordinates.
        class_id   : 0 = Focused, 1 = Distracted.
        confidence : Optional confidence score to display.

    Returns:
        The annotated frame (same object, modified in-place).
    """
    x1, y1, x2, y2 = [int(v) for v in box]
    color  = CLASS_COLORS.get(class_id, (200, 200, 200))
    label  = CLASS_NAMES[class_id] if class_id < len(CLASS_NAMES) else "Unknown"
    if confidence is not None:
        label += f" {confidence:.0%}"

    # Bounding box
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness=2)

    # Label pill background
    (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX,
                                          0.55, 1)
    cv2.rectangle(frame,
                  (x1, y1 - th - baseline - 6),
                  (x1 + tw + 8, y1),
                  color, thickness=-1)

    # Label text
    cv2.putText(frame, label,
                (x1 + 4, y1 - baseline - 3),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                (255, 255, 255), 1, cv2.LINE_AA)

    return frame


def draw_count_overlay(frame: np.ndarray,
                        focused_count: int,
                        distracted_count: int) -> np.ndarray:
    """
    Draw a semi-transparent summary bar at the top of the frame showing
    focused vs. distracted counts.

    Returns:
        Annotated frame.
    """
    h, w = frame.shape[:2]
    bar_h = 54

    # Semi-transparent dark bar
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, bar_h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)

    # Focused count  (orange)
    cv2.putText(frame,
                f"Focused: {focused_count}",
                (14, 35),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9,
                CLASS_COLORS[0], 2, cv2.LINE_AA)

    # Distracted count (blue)
    text = f"Distracted: {distracted_count}"
    (tw, _), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.9, 2)
    cv2.putText(frame,
                text,
                (w - tw - 14, 35),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9,
                CLASS_COLORS[1], 2, cv2.LINE_AA)

    return frame


# ─────────────────────────────────────────────────────────────────────────
# Misc
# ─────────────────────────────────────────────────────────────────────────

def set_seed(seed: int = 42) -> None:
    """Fix random seeds for reproducibility."""
    import random
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def get_device() -> torch.device:
    """Return CUDA if available, else CPU."""
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[INFO] Using device: {device}")
    return device


def ensure_dir(path: str) -> str:
    """Create directory (and parents) if it doesn't exist."""
    os.makedirs(path, exist_ok=True)
    return path
