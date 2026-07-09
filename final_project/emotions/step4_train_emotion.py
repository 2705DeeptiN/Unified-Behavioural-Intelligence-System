"""
STEP 4 — Train Emotion Classifier (FER2013 dataset)
Classes: angry, disgust, fear, happy, neutral, sad, surprise
"""

import os, time, json
import torch
import torch.nn as nn
from torchvision import models, transforms
from torchvision.datasets import ImageFolder
from torch.utils.data import DataLoader
from collections import Counter

# ── CONFIG ─────────────────────────────────────────────
TRAIN_DIR   = "data/emotion/train"
VAL_DIR     = "data/emotion/test"
MODEL_OUT   = "models/emotion_model.pth"

BATCH_SIZE  = 64
EPOCHS_HEAD = 10
EPOCHS_FINE = 5
LR_HEAD     = 1e-3
LR_FINE     = 1e-4
# ──────────────────────────────────────────────────────


def main():
    os.makedirs("models", exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # ── TRANSFORMS ─────────────────────────────────────
    train_tf = transforms.Compose([
        transforms.Grayscale(num_output_channels=3),
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(15),
        transforms.ColorJitter(brightness=0.3, contrast=0.3),
        transforms.RandomAffine(degrees=0, translate=(0.1, 0.1)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406],
                             [0.229, 0.224, 0.225]),
    ])

    val_tf = transforms.Compose([
        transforms.Grayscale(num_output_channels=3),
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406],
                             [0.229, 0.224, 0.225]),
    ])

    # ── DATASET ────────────────────────────────────────
    train_ds = ImageFolder(TRAIN_DIR, transform=train_tf)
    val_ds   = ImageFolder(VAL_DIR, transform=val_tf)

    CLASSES = train_ds.classes
    print(f"Classes: {CLASSES}")

    counts = Counter([s[1] for s in train_ds.samples])
    print("Train samples per class:",
          {CLASSES[k]: v for k, v in counts.items()})

    # ── HANDLE CLASS IMBALANCE ─────────────────────────
    class_counts = [counts[i] for i in range(len(CLASSES))]
    sample_weights = [1.0 / class_counts[lbl]
                      for _, lbl in train_ds.samples]

    sampler = torch.utils.data.WeightedRandomSampler(
        sample_weights, len(sample_weights)
    )

    # ⚠️ IMPORTANT FIX (Windows safe)
    train_loader = DataLoader(
        train_ds,
        batch_size=BATCH_SIZE,
        sampler=sampler,
        num_workers=0,
        pin_memory=False
    )

    val_loader = DataLoader(
        val_ds,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0,   # 👈 changed from 4 → safe
        pin_memory=False
    )

    # ── MODEL ──────────────────────────────────────────
    model = models.mobilenet_v2(
        weights=models.MobileNet_V2_Weights.IMAGENET1K_V1
    )
    model.classifier[1] = nn.Linear(
        model.last_channel, len(CLASSES)
    )
    model = model.to(device)

    criterion = nn.CrossEntropyLoss()

    # ── TRAIN FUNCTION ─────────────────────────────────
    def run_epoch(loader, optimizer=None, train=True):
        model.train() if train else model.eval()

        total_loss = 0
        correct = 0
        total = 0

        with torch.set_grad_enabled(train):
            for imgs, lbls in loader:
                imgs, lbls = imgs.to(device), lbls.to(device)

                if train:
                    optimizer.zero_grad()

                outputs = model(imgs)
                loss = criterion(outputs, lbls)

                if train:
                    loss.backward()
                    optimizer.step()

                total_loss += loss.item() * imgs.size(0)
                correct += (outputs.argmax(1) == lbls).sum().item()
                total += imgs.size(0)

        return total_loss / total, correct / total

    # ── PHASE 1 ────────────────────────────────────────
    print("\n" + "="*60)
    print("PHASE 1 — Classifier head only")
    print("="*60)

    for param in model.features.parameters():
        param.requires_grad = False

    optimizer = torch.optim.Adam(
        model.classifier.parameters(), lr=LR_HEAD
    )

    scheduler = torch.optim.lr_scheduler.StepLR(
        optimizer, step_size=4, gamma=0.5
    )

    best_val_acc = 0.0

    for epoch in range(1, EPOCHS_HEAD + 1):
        t0 = time.time()

        tr_loss, tr_acc = run_epoch(train_loader, optimizer, True)
        va_loss, va_acc = run_epoch(val_loader, None, False)

        scheduler.step()

        print(f"Ep {epoch:2d}/{EPOCHS_HEAD} | "
              f"train={tr_acc:.3f} | val={va_acc:.3f} | "
              f"{time.time()-t0:.1f}s")

        if va_acc > best_val_acc:
            best_val_acc = va_acc
            torch.save(model.state_dict(), MODEL_OUT)
            print(f"✅ Best saved (val={va_acc:.3f})")

    # ── PHASE 2 ────────────────────────────────────────
    print("\n" + "="*60)
    print("PHASE 2 — Fine-tune full network")
    print("="*60)

    for param in model.features.parameters():
        param.requires_grad = True

    optimizer = torch.optim.Adam(model.parameters(), lr=LR_FINE)

    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=EPOCHS_FINE
    )

    for epoch in range(1, EPOCHS_FINE + 1):
        t0 = time.time()

        tr_loss, tr_acc = run_epoch(train_loader, optimizer, True)
        va_loss, va_acc = run_epoch(val_loader, None, False)

        scheduler.step()

        print(f"Ep {epoch:2d}/{EPOCHS_FINE} | "
              f"train={tr_acc:.3f} | val={va_acc:.3f} | "
              f"{time.time()-t0:.1f}s")

        if va_acc > best_val_acc:
            best_val_acc = va_acc
            torch.save(model.state_dict(), MODEL_OUT)
            print(f"✅ Best saved (val={va_acc:.3f})")

    # ── SAVE LABELS ────────────────────────────────────
    json.dump({
        "classes": CLASSES,
        "class_to_idx": train_ds.class_to_idx
    }, open("models/emotion_classes.json", "w"), indent=2)

    print(f"\n🏆 Best val accuracy: {best_val_acc:.3f}")
    print(f"✅ Model saved: {MODEL_OUT}")


# 🔥 CRITICAL FIX (Windows multiprocessing)
if __name__ == "__main__":
    main()