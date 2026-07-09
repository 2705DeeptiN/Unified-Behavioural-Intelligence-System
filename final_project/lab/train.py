"""
train.py
========
Complete training pipeline for Classroom Lab Behavior Analysis.

Usage:
    python train.py --dataset_root "C:/Users/Chithra/Downloads/MINI PROJECT/dataset"

    # Or with custom options:
    python train.py \\
        --dataset_root "C:/path/to/dataset" \\
        --frames_root  "./extracted_frames" \\
        --output_dir   "./output" \\
        --epochs       30 \\
        --batch_size   32 \\
        --lr           0.0003 \\
        --frame_step   10

Dataset folder structure expected:
    dataset/
        focused/      ← videos of focused students
        distracted/   ← videos of distracted students

Pipeline:
    1. Extract frames from videos (skipped if already done)
    2. Build train / val splits (80 / 20)
    3. Train MobileNetV2 with transfer learning
    4. Save best model as output/best_model.pth
    5. Plot training curves & confusion matrix
    6. Print full classification report
"""

import os
import sys
import argparse
import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, random_split

# ── Local modules ──────────────────────────────────────────────────────────
from dataset_loader import (extract_all_videos, build_file_list,
                             FrameDataset, get_transforms)
from model import build_model, count_parameters
from utils import (plot_training_curves, plot_confusion_matrix,
                   print_classification_report, set_seed, get_device,
                   ensure_dir)


# ─────────────────────────────────────────────────────────────────────────
# Argument Parser
# ─────────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Train classroom behavior classifier")
    p.add_argument("--dataset_root", type=str,
                   default=r"C:\Users\Chithra\Downloads\MINI PROJECT\dataset",
                   help="Path to the dataset folder (contains focused/ and distracted/)")
    p.add_argument("--frames_root", type=str, default=None,
                   help="Where to save extracted frames (default: <dataset_root>/../extracted_frames)")
    p.add_argument("--output_dir", type=str, default="./output",
                   help="Directory for saved models and plots")
    p.add_argument("--epochs",      type=int,   default=25)
    p.add_argument("--batch_size",  type=int,   default=32)
    p.add_argument("--lr",          type=float, default=3e-4,
                   help="Initial learning rate")
    p.add_argument("--frame_step",  type=int,   default=2,
                   help="Extract 1 frame every N frames from each video")
    p.add_argument("--val_split",   type=float, default=0.2,
                   help="Fraction of data used for validation (0-1)")
    p.add_argument("--freeze_epochs", type=int, default=5,
                   help="Epochs to train with frozen backbone (0 = no freeze)")
    p.add_argument("--seed",        type=int,   default=42)
    p.add_argument("--workers",     type=int,   default=0,
                   help="DataLoader workers (0 = main thread; safe on Windows)")
    return p.parse_args()


# ─────────────────────────────────────────────────────────────────────────
# Training Loop (one epoch)
# ─────────────────────────────────────────────────────────────────────────

def run_epoch(model, loader, criterion, optimizer, device, is_train=True):
    """
    Run one epoch of training or validation.

    Returns:
        avg_loss : Mean loss over the epoch.
        accuracy : % correct predictions.
    """
    model.train() if is_train else model.eval()
    total_loss = 0.0
    correct    = 0
    total      = 0

    ctx = torch.enable_grad() if is_train else torch.no_grad()

    with ctx:
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device)

            outputs = model(images)
            loss    = criterion(outputs, labels)

            if is_train:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

            total_loss += loss.item() * images.size(0)
            preds       = outputs.argmax(dim=1)
            correct    += (preds == labels).sum().item()
            total      += images.size(0)

    avg_loss = total_loss / total if total > 0 else 0.0
    accuracy = 100.0 * correct / total if total > 0 else 0.0
    return avg_loss, accuracy


# ─────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────

def main():
    args   = parse_args()
    device = get_device()
    set_seed(args.seed)

    # ── 0. Paths ────────────────────────────────────────────────────────────
    dataset_root = args.dataset_root
    frames_root  = args.frames_root or str(Path(dataset_root).parent / "extracted_frames")
    output_dir   = ensure_dir(args.output_dir)
    model_path   = os.path.join(output_dir, "best_model.pth")
    curves_path  = os.path.join(output_dir, "training_curves.png")
    cm_path      = os.path.join(output_dir, "confusion_matrix.png")

    print("=" * 65)
    print("   CLASSROOM LAB BEHAVIOR ANALYSIS — TRAINING")
    print("   Classes: Focused (0)  |  Distracted (1)")
    print("=" * 65)
    print(f"  Dataset root : {dataset_root}")
    print(f"  Frames root  : {frames_root}")
    print(f"  Output dir   : {output_dir}")
    print(f"  Epochs       : {args.epochs}")
    print(f"  Batch size   : {args.batch_size}")
    print(f"  Learning rate: {args.lr}")
    print(f"  Frame step   : {args.frame_step}")
    print("=" * 65)

    # ── 1. Frame Extraction ─────────────────────────────────────────────────
    # Check if frames already exist to avoid re-extraction
    focused_done    = os.path.isdir(os.path.join(frames_root, "focused"))
    distracted_done = os.path.isdir(os.path.join(frames_root, "distracted"))

    if focused_done and distracted_done:
        print("\n[INFO] Extracted frames already found. Skipping extraction.")
        print(f"       (Delete '{frames_root}' to force re-extraction)")
    else:
        print("\n[STEP 1/5] Extracting frames from videos…")
        extract_all_videos(dataset_root, frames_root,
                           frame_step=args.frame_step)

    # ── 2. Dataset Split ────────────────────────────────────────────────────
    print("\n[STEP 2/5] Building dataset splits…")
    all_samples = build_file_list(frames_root)

    if len(all_samples) == 0:
        print("[ERROR] No samples found. Check your dataset_root path.")
        print("        Expected folder structure:")
        print(f"          {dataset_root}/")
        print(f"            focused/      ← videos")
        print(f"            distracted/   ← videos")
        sys.exit(1)

    n_val   = int(len(all_samples) * args.val_split)
    n_train = len(all_samples) - n_val
    train_samples, val_samples = random_split(
        all_samples, [n_train, n_val],
        generator=torch.Generator().manual_seed(args.seed)
    )

    print(f"         Train: {len(train_samples)} frames")
    print(f"         Val  : {len(val_samples)} frames")

    train_tf = get_transforms("train")
    val_tf   = get_transforms("val")

    train_ds = FrameDataset(list(train_samples), train_tf)
    val_ds   = FrameDataset(list(val_samples),   val_tf)

    train_loader = DataLoader(train_ds, batch_size=args.batch_size,
                               shuffle=True,  num_workers=args.workers,
                               pin_memory=True)
    val_loader   = DataLoader(val_ds,   batch_size=args.batch_size,
                               shuffle=False, num_workers=args.workers,
                               pin_memory=True)

    # ── 3. Model ────────────────────────────────────────────────────────────
    print("\n[STEP 3/5] Building model…")
    freeze = args.freeze_epochs > 0
    model  = build_model(num_classes=2, pretrained=True,
                          freeze_backbone=freeze)
    model  = model.to(device)
    print(f"         Trainable params: {count_parameters(model):,}")

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=args.lr
    )
    scheduler = optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=args.epochs, eta_min=1e-6
    )

    # ── 4. Training Loop ────────────────────────────────────────────────────
    print("\n[STEP 4/5] Training…\n")

    best_val_acc  = 0.0
    train_losses, val_losses = [], []
    train_accs,   val_accs   = [], []

    for epoch in range(1, args.epochs + 1):
        t0 = time.time()

        # Unfreeze backbone after `freeze_epochs`
        if epoch == args.freeze_epochs + 1 and freeze:
            for param in model.features.parameters():
                param.requires_grad = True
            print(f"[INFO] Epoch {epoch}: backbone unfrozen — all layers now trainable")
            # Rebuild optimizer to include newly unfrozen params
            optimizer = optim.Adam(model.parameters(), lr=args.lr * 0.3)
            scheduler = optim.lr_scheduler.CosineAnnealingLR(
                optimizer, T_max=args.epochs - epoch, eta_min=1e-6
            )

        tr_loss, tr_acc = run_epoch(model, train_loader, criterion,
                                     optimizer, device, is_train=True)
        vl_loss, vl_acc = run_epoch(model, val_loader,   criterion,
                                     None,      device, is_train=False)

        scheduler.step()

        train_losses.append(tr_loss)
        val_losses.append(vl_loss)
        train_accs.append(tr_acc)
        val_accs.append(vl_acc)

        elapsed = time.time() - t0
        print(f"  Epoch [{epoch:3d}/{args.epochs}]  "
              f"Train Loss: {tr_loss:.4f}  Train Acc: {tr_acc:6.2f}%  |  "
              f"Val Loss: {vl_loss:.4f}  Val Acc: {vl_acc:6.2f}%  "
              f"({elapsed:.1f}s)")

        # ── Save best checkpoint ──
        if vl_acc > best_val_acc:
            best_val_acc = vl_acc
            torch.save({
                "epoch":            epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "val_acc":          vl_acc,
                "val_loss":         vl_loss,
            }, model_path)
            print(f"             ✓ New best model saved (val_acc={vl_acc:.2f}%)")

    # ── 5. Evaluation ───────────────────────────────────────────────────────
    print("\n[STEP 5/5] Evaluating on validation set with best model…")

    # Reload best weights
    ckpt = torch.load(model_path, map_location=device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    all_preds, all_labels = [], []
    with torch.no_grad():
        for images, labels in val_loader:
            outputs = model(images.to(device))
            preds   = outputs.argmax(dim=1).cpu().tolist()
            all_preds.extend(preds)
            all_labels.extend(labels.tolist())

    plot_training_curves(train_losses, val_losses,
                          train_accs,   val_accs,
                          save_path=curves_path)
    plot_confusion_matrix(all_labels, all_preds, save_path=cm_path)
    print_classification_report(all_labels, all_preds)

    print("\n" + "=" * 65)
    print(f"  TRAINING COMPLETE")
    print(f"  Best Validation Accuracy : {best_val_acc:.2f}%")
    print(f"  Model saved              : {model_path}")
    print(f"  Training curves          : {curves_path}")
    print(f"  Confusion matrix         : {cm_path}")
    print("=" * 65)


if __name__ == "__main__":
    main()
