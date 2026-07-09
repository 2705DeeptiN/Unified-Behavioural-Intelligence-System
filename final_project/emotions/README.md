# Classroom Monitor — Setup & Run Guide

## Folder Structure (what to put where)

```
classroom_monitor/
├── inference.py              ← MAIN FILE TO RUN
├── requirements.txt
├── best_writing_model.pth    ← copy from your existing project
├── models/
│   ├── drowsy_model.pth      ← copy from your existing project
│   └── emotion_model.pth     ← copy from your existing project
└── output/                   ← annotated videos saved here
```

## Setup

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

YOLOv8 will auto-download `yolov8n.pt` (~6MB) on first run.

### 2. Copy your model files
```
best_writing_model.pth  → classroom_monitor/best_writing_model.pth
drowsy_model.pth        → classroom_monitor/models/drowsy_model.pth
emotion_model.pth       → classroom_monitor/models/emotion_model.pth
```

### 3. Run
```bash
cd classroom_monitor
python inference.py
```

Then select:
- `1` for webcam
- `2` for a video file (enter path when prompted)

Press `Q` to quit. Output video + JSON log saved to `output/`.

---

## What the Pipeline Does (Step by Step)

| Step | What happens |
|------|-------------|
| 1 | YOLOv8 detects **each person** in the frame |
| 2 | MediaPipe FaceDetection finds **face inside each person box** |
| 3 | MediaPipe Pose estimates **body keypoints** per person |
| 4 | Writing model + **pose heuristics** (head down, wrist position) → Writing / Not Writing |
| 5 | Emotion model + Drowsy model run on **face crop only** |
| 6 | **Centroid Tracker** assigns persistent Student IDs across frames |
| 7 | **Attention logic**: Writing/emotion/drowsy → Attentive / Not Attentive |
| 8 | **Majority voting** over 15-frame window → dominant attention state |
| 9 | Box per student: ID, emotion, writing, attention, dominant state |

## Attention Decision Rules

**Attentive if:**
- Writing = YES, OR
- Emotion = happy / neutral (when not writing), OR
- Emotion = surprise

**Not Attentive if:**
- Drowsy_label = Closed_Eyes or yawn, OR
- Emotion = sad / angry / disgust / fear, OR
- Talking = YES, OR
- Not Writing + neutral emotion (inactive)

## Tuning Parameters (top of inference.py)

| Variable | Default | Effect |
|----------|---------|--------|
| `TEMPORAL_WINDOW` | 15 | Frames for majority vote (higher = smoother, slower to react) |
| `PERSON_CONF` | 0.40 | YOLO confidence (lower = detect more people, more false positives) |
| `FACE_CONF` | 0.40 | MediaPipe face sensitivity |
| `SKIP_FRAMES` | 2 | Run detection every N frames (higher = faster but less smooth) |
| `MAX_TRACK_DIST` | 80 | Centroid tracker distance (px); increase if IDs flicker |

## Fixing Common Issues

**Very few detections / no people found:**
- Lower `PERSON_CONF` to `0.30`
- Lower `FACE_CONF` to `0.30`
- If video is low resolution, try `SKIP_FRAMES = 1`

**IDs keep changing / flickering:**
- Increase `MAX_TRACK_DIST` to `120`
- Increase `max_disappeared` in CentroidTracker to `40`

**Slow / low FPS:**
- Increase `SKIP_FRAMES` to `3` or `4`
- Use GPU (CUDA): install torch with CUDA support

**Writing model seems off:**
- The model was trained on full frames; now it runs on person crops.
  Pose heuristics compensate. You can retrain on cropped person images
  for better accuracy.

## Training Scripts (unchanged from your originals)

- `step2_train_writing.py` — train writing classifier
- `step3_train_drowsy.py` — train drowsy classifier  
- `step4_train_emotion.py` — train emotion classifier

These are unchanged; just copy them alongside inference.py if you want to retrain.
