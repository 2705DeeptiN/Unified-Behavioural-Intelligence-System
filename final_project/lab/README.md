# 🎓 Classroom Lab Behavior Analysis
### Deep Learning Pipeline — Focused vs. Distracted Classification

---

## 📁 Project Structure

```
classroom_behavior_analysis/
│
├── dataset_loader.py     ← Frame extraction + PyTorch Dataset
├── model.py              ← MobileNetV2 model architecture
├── utils.py              ← Plotting, overlays, helpers
├── train.py              ← Full training pipeline
├── test.py               ← Video testing + live window + report
├── requirements.txt      ← Python dependencies
├── yolov8n.pt            ← YOLOv8n weights (person detector)
└── README.md             ← This file

output/                   ← Created automatically during training/testing
├── best_model.pth
├── training_curves.png
├── confusion_matrix.png
└── <video_name>_result.mp4

extracted_frames/         ← Created automatically during training
├── focused/
│   ├── f1/
│   │   ├── f1_frame_00000.jpg
│   │   └── …
│   └── …
└── distracted/
    ├── d1/
    └── …
```

---

## 🏷️ Class Labels

| Class ID | Label        | Color  | Meaning                              |
|----------|--------------|--------|--------------------------------------|
| 0        | **Focused**  | Orange | Student is focused / working         |
| 1        | **Distracted** | Blue | Student is distracted / off-task     |

> **Training dataset folders must be named `focused/` and `distracted/`**
> (previously `typing/` and `discussion/` — these have been renamed)

---

## ⚙️ Installation

### 1. Install Python
Download Python 3.9+ from https://python.org

### 2. (Recommended) Create a virtual environment
```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac / Linux
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

> **GPU users:** Install the CUDA-enabled PyTorch build from https://pytorch.org

---

## 🚀 How to Run

### Step 1 — Train the Model

Rename your dataset folders to `focused/` and `distracted/` if needed, then run:

```bash
python train.py --dataset_root "C:\Users\Chithra\Downloads\MINI PROJECT\dataset"
```

**Expected dataset folder layout:**
```
dataset/
├── focused/        ← videos of focused students
│   ├── f1.mp4
│   ├── f2.mp4
│   └── …
└── distracted/     ← videos of distracted students
    ├── d1.mp4
    ├── d2.mp4
    └── …
```

**What happens:**
1. Frames are extracted from all videos in `focused/` and `distracted/`
2. Dataset is split 80% train / 20% validation
3. MobileNetV2 (pretrained on ImageNet) is fine-tuned
4. Best model saved to `output/best_model.pth`
5. Training curves & confusion matrix saved to `output/`

**Common options:**
```bash
python train.py ^
  --dataset_root "C:\Users\Chithra\Downloads\MINI PROJECT\dataset" ^
  --epochs       30     ^
  --batch_size   32     ^
  --lr           0.0003 ^
  --frame_step   8
```

---

### Step 2 — Test on a Video (Auto Random Selection)

Simply run without any arguments — the program will **automatically pick a random video**
from the lab dataset folder:

```bash
python test.py
```

This uses the default lab dataset path:
```
C:\Users\Chithra\Downloads\lab dataset
```

**What happens:**
1. A random `.mp4` video is selected from the lab dataset folder
2. Each frame is processed by YOLOv8 to detect students
3. Each detected student is classified as **Focused** or **Distracted**
4. Bounding boxes and labels appear on screen in real time
5. Press `Q` to quit the live window
6. Annotated video saved to `output/<video_name>_result.mp4`
7. Summary report printed in the terminal

---

### Optional — Test on a Specific Video

```bash
python test.py --video "C:\path\to\video.mp4"
```

### Optional — Change the Lab Dataset Folder

```bash
python test.py --lab_dataset "D:\my lab recordings"
```

### All test.py Options

```bash
python test.py ^
  --lab_dataset  "C:\Users\Chithra\Downloads\lab dataset"  ^
  --video        "specific_video.mp4"   ^   (optional — overrides random pick)
  --model        "output/best_model.pth"  ^
  --frame_skip   2                       ^   (process every 2nd frame, faster)
  --conf         0.4                     ^   (YOLO detection confidence)
  --no_display                           ^   (skip live window / headless)
  --output_dir   "./results"
```

---

## 📊 Sample Terminal Report

```
══════════════════════════════════════════════════════════════
   📊  FINAL ANALYSIS REPORT
══════════════════════════════════════════════════════════════
  Input video     : d15.mp4
  Frames processed: 342
  Processing time : 18.4s  (18.6 fps)
────────────────────────────────────────────────────────────
  Total student detections : 1026
  ├─ Focused               : 712
  └─ Distracted            : 314
────────────────────────────────────────────────────────────
  Behavior Distribution:
  Focused    [█████████████████████        ]  69.4%
  Distracted [█████████                    ]  30.6%
────────────────────────────────────────────────────────────
  Insight: ✅  Lab is predominantly FOCUSED on their tasks.
══════════════════════════════════════════════════════════════
```

---

## 🧠 Model Details

| Feature | Detail |
|---|---|
| Architecture | MobileNetV2 (ImageNet pretrained) |
| Input size | 224 × 224 px |
| Classifier head | Dropout → Linear(1280→256) → ReLU → Dropout → Linear(256→2) |
| Augmentation | Flip, Rotation ±15°, Color jitter, Random Erasing |
| Optimizer | Adam + Cosine Annealing LR |
| Detection | YOLOv8n (person class only) |
| Fallback | 2×3 grid regions (no YOLO) |
| Class 0 | **Focused** (Orange bounding box) |
| Class 1 | **Distracted** (Blue bounding box) |

---

## 📦 Files Explained

| File | Purpose |
|---|---|
| `dataset_loader.py` | Extracts frames from videos; creates PyTorch Dataset |
| `model.py` | MobileNetV2 architecture + load/save utilities |
| `utils.py` | Plotting, bbox drawing, count overlay, seeding |
| `train.py` | Full training pipeline (run first if retraining) |
| `test.py` | Video inference — auto-picks random lab video on startup |
| `yolov8n.pt` | YOLOv8n person detection weights |
| `requirements.txt` | `pip install -r requirements.txt` |

---

## 🐛 Troubleshooting

| Problem | Fix |
|---|---|
| `No module named 'ultralytics'` | `pip install ultralytics` (or use `--no_display` to skip YOLO) |
| Out of memory | Reduce `--batch_size` to 8 or 16 |
| Frames not found | Check `--dataset_root` path; folders must be named `focused` / `distracted` |
| Lab dataset not found | Check `--lab_dataset` path points to your lab video folder |
| No videos in lab dataset | Ensure folder contains `.mp4`, `.avi`, `.mov`, or `.mkv` files |
| Low accuracy | Try `--frame_step 5` (more frames) and `--epochs 40` |
| Slow inference | Add `--frame_skip 3` to test.py |
| YOLO not detecting | Lower `--conf` to 0.3 |

---

## 🔄 Migration from Previous Version

If you were using the previous version with `typing/` and `discussion/` labels:

| Old Label | New Label |
|---|---|
| `typing` | `focused` |
| `discussion` | `distracted` |

**To retrain on existing data:**
1. Rename your dataset folders: `typing/` → `focused/`, `discussion/` → `distracted/`
2. Delete `extracted_frames/` (will be regenerated automatically)
3. Run `python train.py --dataset_root <path>`
