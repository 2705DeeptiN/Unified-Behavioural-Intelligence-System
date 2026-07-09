"""
model.py
========
Model architecture for Classroom Lab Behavior Classification.

Design choices:
    • MobileNetV2 backbone – lightweight, fast, accurate on small datasets
    • Pretrained on ImageNet – gives strong visual feature extraction out-of-the-box
    • Custom classifier head with Dropout to reduce overfitting
    • Binary output: 0 = Focused, 1 = Distracted
"""

import torch
import torch.nn as nn
from torchvision import models


def build_model(num_classes: int = 2,
                pretrained: bool = True,
                freeze_backbone: bool = False) -> nn.Module:
    """
    Build a MobileNetV2-based image classifier.

    Args:
        num_classes      : Number of output classes (default 2).
        pretrained       : Load ImageNet pretrained weights.
        freeze_backbone  : If True, freeze all layers except the classifier.
                           Useful for very small datasets or fast fine-tuning.

    Returns:
        model : nn.Module ready for training.
    """
    # ── Load pretrained backbone ──────────────────────────────────────────
    weights = models.MobileNet_V2_Weights.IMAGENET1K_V1 if pretrained else None
    model   = models.mobilenet_v2(weights=weights)

    # ── Optionally freeze the feature extractor ───────────────────────────
    if freeze_backbone:
        for param in model.features.parameters():
            param.requires_grad = False

    # ── Replace the default classifier head ──────────────────────────────
    # Original: Linear(1280 → 1000)
    # Ours    : Dropout → Linear(1280 → 256) → ReLU → Dropout → Linear(256 → num_classes)
    in_features = model.classifier[1].in_features  # 1280

    model.classifier = nn.Sequential(
        nn.Dropout(p=0.4),
        nn.Linear(in_features, 256),
        nn.ReLU(inplace=True),
        nn.Dropout(p=0.3),
        nn.Linear(256, num_classes),
    )

    return model


def load_model(model_path: str,
               num_classes: int = 2,
               device: torch.device = None) -> nn.Module:
    """
    Load a saved model checkpoint from disk.

    Args:
        model_path  : Path to the .pth file.
        num_classes : Number of output classes.
        device      : torch.device (cpu / cuda). Auto-detected if None.

    Returns:
        model set to eval mode, placed on `device`.
    """
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = build_model(num_classes=num_classes, pretrained=False)
    state = torch.load(model_path, map_location=device)

    # Support both raw state_dict and checkpoint dicts
    if "model_state_dict" in state:
        model.load_state_dict(state["model_state_dict"])
    else:
        model.load_state_dict(state)

    model.to(device)
    model.eval()
    print(f"[INFO] Model loaded from '{model_path}' on {device}")
    return model


def count_parameters(model: nn.Module) -> int:
    """Return total number of trainable parameters."""
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


# ── Sanity check ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    model = build_model(num_classes=2, pretrained=False)
    print(model)
    print(f"\nTrainable parameters: {count_parameters(model):,}")

    # Forward pass test
    dummy  = torch.randn(4, 3, 224, 224)
    output = model(dummy)
    print(f"Output shape: {output.shape}")   # Expected: [4, 2]
