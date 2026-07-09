"""
STEP 3 — Train Drowsiness Classifier
Classes: Closed_Eyes, Open_Eyes, no yawn, yawn
→ Combined into: Sleepy / Awake at inference time
"""

import os, time, json
import torch
import torch.nn as nn
from torchvision import models, transforms
from torchvision.datasets import ImageFolder
from torch.utils.data import DataLoader, Subset
from sklearn.model_selection import train_test_split

# ── CONFIG ───────────────────────────────────────────────────────────────────
DATA_DIR    = "data/drowsy"   # ✅ FIXED PATH
MODEL_OUT   = "models/drowsy_model.pth"
BATCH_SIZE  = 32
EPOCHS_HEAD = 8
EPOCHS_FINE = 4
LR_HEAD     = 1e-3
LR_FINE     = 1e-4
VAL_SPLIT   = 0.2
NUM_WORKERS = 0   # ✅ FIXED (no multiprocessing crash)
# ─────────────────────────────────────────────────────────────────────────────


def main():

    os.makedirs("models", exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # =========================
    # TRANSFORMS
    # =========================
    train_tf = transforms.Compose([
        transforms.Grayscale(num_output_channels=3),
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(10),
        transforms.ColorJitter(brightness=0.3, contrast=0.3),
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

    # =========================
    # DATASET
    # =========================
    full_ds  = ImageFolder(DATA_DIR, transform=train_tf)
    val_ds_r = ImageFolder(DATA_DIR, transform=val_tf)

    CLASSES  = full_ds.classes
    print(f"Classes: {CLASSES}")

    # Count per class
    from collections import Counter
    counts = Counter([s[1] for s in full_ds.samples])
    print("Samples per class:", {CLASSES[k]: v for k, v in counts.items()})

    labels = [s[1] for s in full_ds.samples]
    idx_tr, idx_va = train_test_split(
        range(len(full_ds)),
        test_size=VAL_SPLIT,
        stratify=labels,
        random_state=42
    )

    # =========================
    # DATALOADER
    # =========================
    train_loader = DataLoader(
        Subset(full_ds, idx_tr),
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=NUM_WORKERS
    )

    val_loader = DataLoader(
        Subset(val_ds_r, idx_va),
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=NUM_WORKERS
    )

    # =========================
    # CLASS WEIGHTS
    # =========================
    class_counts = [counts[i] for i in range(len(CLASSES))]
    weights = torch.tensor([1.0 / c for c in class_counts],
                           dtype=torch.float).to(device)

    criterion = nn.CrossEntropyLoss(weight=weights)

    # =========================
    # MODEL
    # =========================
    model = models.mobilenet_v2(
        weights=models.MobileNet_V2_Weights.IMAGENET1K_V1
    )

    model.classifier[1] = nn.Linear(model.last_channel, len(CLASSES))
    model = model.to(device)

    # =========================
    # TRAIN FUNCTION
    # =========================
    def run_epoch(loader, train=True):
        model.train() if train else model.eval()

        total_loss = correct = total = 0

        with torch.set_grad_enabled(train):
            for imgs, lbls in loader:
                imgs, lbls = imgs.to(device), lbls.to(device)

                optimizer.zero_grad()
                out  = model(imgs)
                loss = criterion(out, lbls)

                if train:
                    loss.backward()
                    optimizer.step()

                total_loss += loss.item() * imgs.size(0)
                correct    += (out.argmax(1) == lbls).sum().item()
                total      += imgs.size(0)

        return total_loss / total, correct / total

    # =========================
    # PHASE 1
    # =========================
    print("\n" + "="*60)
    print("PHASE 1 — Classifier head only")
    print("="*60)

    for param in model.features.parameters():
        param.requires_grad = False

    optimizer = torch.optim.Adam(model.classifier.parameters(), lr=LR_HEAD)

    best_val_acc = 0.0

    for epoch in range(1, EPOCHS_HEAD + 1):
        t0 = time.time()

        tr_loss, tr_acc = run_epoch(train_loader, True)
        va_loss, va_acc = run_epoch(val_loader,  False)

        print(f"  Ep {epoch:2d}  train={tr_acc:.3f}  val={va_acc:.3f}  [{time.time()-t0:.1f}s]")

        if va_acc > best_val_acc:
            best_val_acc = va_acc
            torch.save(model.state_dict(), MODEL_OUT)
            print(f"           ✅ Best saved (val={va_acc:.3f})")

    # =========================
    # PHASE 2
    # =========================
    print("\n" + "="*60)
    print("PHASE 2 — Fine-tune full network")
    print("="*60)

    for param in model.features.parameters():
        param.requires_grad = True

    optimizer = torch.optim.Adam(model.parameters(), lr=LR_FINE)

    for epoch in range(1, EPOCHS_FINE + 1):
        t0 = time.time()

        tr_loss, tr_acc = run_epoch(train_loader, True)
        va_loss, va_acc = run_epoch(val_loader,  False)

        print(f"  Ep {epoch:2d}  train={tr_acc:.3f}  val={va_acc:.3f}  [{time.time()-t0:.1f}s]")

        if va_acc > best_val_acc:
            best_val_acc = va_acc
            torch.save(model.state_dict(), MODEL_OUT)
            print(f"           ✅ Best saved (val={va_acc:.3f})")

    # =========================
    # SAVE LABELS
    # =========================
    json.dump(
        {"classes": CLASSES, "class_to_idx": full_ds.class_to_idx},
        open("models/drowsy_classes.json", "w"),
        indent=2
    )

    print(f"\n🏆 Best val accuracy: {best_val_acc:.3f}")
    print(f"✅ Model saved: {MODEL_OUT}")


# =========================
# ENTRY POINT (CRITICAL FIX)
# =========================
if __name__ == "__main__":
    main()