import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, transforms, models
from torch.utils.data import DataLoader, random_split
import os

# =========================
# CONFIG
# =========================
DATA_DIR = "data"   # should contain /writing and /not_writing
IMG_SIZE = 224
BATCH_SIZE = 32
EPOCHS = 10
LR = 0.001
NUM_WORKERS = 0   # IMPORTANT FIX (Windows issue)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# =========================
# MAIN FUNCTION
# =========================
def main():

    print(f"Device: {DEVICE}")

    # =========================
    # TRANSFORMS
    # =========================
    transform = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.RandomHorizontalFlip(),
        transforms.ToTensor(),
    ])

    # =========================
    # DATASET
    # =========================
    dataset = datasets.ImageFolder(DATA_DIR, transform=transform)

    class_names = dataset.classes
    print("Classes:", class_names)

    class_to_idx = dataset.class_to_idx
    print("Class → idx:", class_to_idx)

    # Split dataset
    total_size = len(dataset)
    train_size = int(0.8 * total_size)
    val_size = total_size - train_size

    train_dataset, val_dataset = random_split(dataset, [train_size, val_size])

    print(f"Total: {total_size} | Train: {train_size} | Val: {val_size}")

    # =========================
    # DATALOADER
    # =========================
    train_loader = DataLoader(
        train_dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=NUM_WORKERS
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=NUM_WORKERS
    )

    # =========================
    # MODEL (Transfer Learning)
    # =========================
    model = models.mobilenet_v2(pretrained=True)

    # Freeze backbone
    for param in model.features.parameters():
        param.requires_grad = False

    # Replace classifier
    model.classifier[1] = nn.Linear(model.last_channel, len(class_names))

    model = model.to(DEVICE)

    # =========================
    # LOSS + OPTIMIZER
    # =========================
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=LR)

    # =========================
    # TRAIN FUNCTION
    # =========================
    def run_epoch(loader, train=True):
        if train:
            model.train()
        else:
            model.eval()

        total_loss = 0
        correct = 0
        total = 0

        with torch.set_grad_enabled(train):
            for imgs, labels in loader:
                imgs, labels = imgs.to(DEVICE), labels.to(DEVICE)

                outputs = model(imgs)
                loss = criterion(outputs, labels)

                if train:
                    optimizer.zero_grad()
                    loss.backward()
                    optimizer.step()

                total_loss += loss.item()

                _, preds = torch.max(outputs, 1)
                correct += (preds == labels).sum().item()
                total += labels.size(0)

        return total_loss / len(loader), correct / total

    # =========================
    # TRAINING LOOP
    # =========================
    print("\n" + "="*50)
    print("TRAINING STARTED")
    print("="*50)

    best_acc = 0.0

    for epoch in range(EPOCHS):
        train_loss, train_acc = run_epoch(train_loader, train=True)
        val_loss, val_acc = run_epoch(val_loader, train=False)

        print(f"\nEpoch {epoch+1}/{EPOCHS}")
        print(f"Train Loss: {train_loss:.4f} | Train Acc: {train_acc:.4f}")
        print(f"Val   Loss: {val_loss:.4f} | Val   Acc: {val_acc:.4f}")

        # Save best model
        if val_acc > best_acc:
            best_acc = val_acc
            torch.save(model.state_dict(), "best_writing_model.pth")
            print("✅ Model saved!")

    print("\n🎉 Training Complete!")
    print(f"Best Validation Accuracy: {best_acc:.4f}")


# =========================
# ENTRY POINT (FIXES ERROR)
# =========================
if __name__ == "__main__":
    main()