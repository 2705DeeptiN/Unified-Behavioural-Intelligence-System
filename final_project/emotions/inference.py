"""
CLASSROOM MONITOR — Complete Pipeline
======================================
Step 1: YOLOv8 person detection
Step 2: MediaPipe face detection (per person crop)
Step 3: MediaPipe Pose (per person crop)
Step 4: Writing/Not-Writing (pose + posture features)
Step 5: Emotion + Drowsy/State detection (per face)
Step 6: Centroid Tracker (persistent student IDs)
Step 7: Attention classification logic
Step 8: Temporal majority voting (per student)
Step 9: Rich annotation output
"""

import cv2
import torch
import torch.nn as nn
import numpy as np
import mediapipe as mp
from torchvision import models, transforms
from collections import deque, Counter, defaultdict
import json, time, os, math
from datetime import datetime

# ── Try importing YOLO ──────────────────────────────────────────────────────
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("[WARN] ultralytics not installed → pip install ultralytics")
    print("[INFO] Falling back to MediaPipe person/face detection only")

# ════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ════════════════════════════════════════════════════════════════════════════
# Anchor all model paths to THIS script's own folder, so the .pth files are
# found no matter what the current working directory is when the script is
# run (Flask launches it from a different cwd, and live_engine imports it).
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

WRITING_MODEL_PATH = os.path.join(_SCRIPT_DIR, "best_writing_model.pth")
DROWSY_MODEL_PATH  = os.path.join(_SCRIPT_DIR, "models", "drowsy_model.pth")
EMOTION_MODEL_PATH = os.path.join(_SCRIPT_DIR, "models", "emotion_model.pth")

OUTPUT_DIR      = os.path.join(_SCRIPT_DIR, "output")
TEMPORAL_WINDOW = 15        # frames for majority voting
MIN_FACE_SIZE   = 20        # px — ignore tiny detections
PERSON_CONF     = 0.55      # YOLO person confidence threshold (raised to
                            # reject wall textures / shadows as "people")
FACE_CONF       = 0.55      # MediaPipe face confidence (raised likewise)
SKIP_FRAMES     = 5         # process every Nth frame (higher = faster).
                            # At 25-30 fps this still gives ~5-6 analysed
                            # frames per second — ample for the 15-frame
                            # temporal majority vote, so accuracy holds.
MAX_TRACK_DIST  = 80        # centroid tracker max pixel distance

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ════════════════════════════════════════════════════════════════════════════
#  CLASS LABELS  (must match how models were trained)
# ════════════════════════════════════════════════════════════════════════════
WRITING_CLASSES = ["not_writing", "writing"]   # ImageFolder sorts alphabetically
DROWSY_CLASSES  = ["Closed_Eyes", "Open_Eyes", "no yawn", "yawn"]
EMOTION_CLASSES = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]

# ════════════════════════════════════════════════════════════════════════════
#  DEVICE
# ════════════════════════════════════════════════════════════════════════════
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"[INFO] Using device: {device}")

# ════════════════════════════════════════════════════════════════════════════
#  MODEL LOADING
# ════════════════════════════════════════════════════════════════════════════
def load_mobilenet(path, num_classes):
    if not os.path.exists(path):
        print(f"[WARN] Model not found: {path} — this classifier will return defaults")
        return None
    m = models.mobilenet_v2(weights=None)
    m.classifier[1] = nn.Linear(m.last_channel, num_classes)
    state = torch.load(path, map_location=device)
    m.load_state_dict(state)
    m.eval().to(device)
    print(f"[OK]  Loaded {path}")
    return m

writing_model = load_mobilenet(WRITING_MODEL_PATH, 2)
drowsy_model  = load_mobilenet(DROWSY_MODEL_PATH,  4)
emotion_model = load_mobilenet(EMOTION_MODEL_PATH, 7)

# ════════════════════════════════════════════════════════════════════════════
#  IMAGE TRANSFORMS
# ════════════════════════════════════════════════════════════════════════════
# Grayscale transform — matches drowsy/emotion training (they used Grayscale)
gray_tf = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Grayscale(num_output_channels=3),
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

# Color transform — matches writing training (no Grayscale step)
color_tf = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

@torch.no_grad()
def predict(model, img_rgb, grayscale=True):
    """Run model on a numpy RGB crop. Returns (label_idx, confidence)."""
    if model is None:
        return 0, 0.0
    tf = gray_tf if grayscale else color_tf
    try:
        t = tf(img_rgb).unsqueeze(0).to(device)
        prob = torch.softmax(model(t), dim=1)[0]
        idx  = prob.argmax().item()
        return idx, prob[idx].item()
    except Exception:
        return 0, 0.0

# ════════════════════════════════════════════════════════════════════════════
#  MEDIAPIPE SETUP
# ════════════════════════════════════════════════════════════════════════════
mp_face_det  = mp.solutions.face_detection
mp_pose      = mp.solutions.pose
mp_face_mesh = mp.solutions.face_mesh
mp_draw      = mp.solutions.drawing_utils

face_detector = mp_face_det.FaceDetection(
    model_selection=1, min_detection_confidence=FACE_CONF)

pose_estimator = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=0,           # 0=fastest, enough for keypoints
    smooth_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)

face_mesher = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=False,
    min_detection_confidence=0.4,
    min_tracking_confidence=0.4,
)

UPPER_LIP, LOWER_LIP = 13, 14
MOUTH_OPEN_THRESH = 0.035

# ════════════════════════════════════════════════════════════════════════════
#  YOLO PERSON DETECTOR
# ════════════════════════════════════════════════════════════════════════════
yolo_model = None
if YOLO_AVAILABLE:
    try:
        # Use the yolov8n.pt bundled next to this script. Only fall back to
        # the bare name (which triggers a download) if the local file is
        # genuinely missing.
        _yolo_local = os.path.join(_SCRIPT_DIR, "yolov8n.pt")
        _yolo_path  = _yolo_local if os.path.isfile(_yolo_local) else "yolov8n.pt"
        print(f"[INFO] Loading YOLOv8n from: {_yolo_path}")
        yolo_model = YOLO(_yolo_path)
        print("[OK]  YOLOv8n loaded for person detection")
    except Exception as e:
        print(f"[WARN] YOLO load failed: {e}")

def detect_persons_yolo(frame_bgr):
    """Returns list of (x1,y1,x2,y2) for class=person detections.

    A plausibility filter rejects boxes that cannot be a real person —
    this stops the system from labelling a blank wall, a shadow or a small
    texture blob as a "student".
    """
    if yolo_model is None:
        return []
    H, W = frame_bgr.shape[:2]
    frame_area = float(max(1, H * W))
    results = yolo_model(frame_bgr, classes=[0], conf=PERSON_CONF, verbose=False)[0]
    boxes = []
    for box in results.boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        bw, bh = (x2 - x1), (y2 - y1)
        if bw <= 0 or bh <= 0:
            continue
        # ── Plausibility checks for a real person ──────────────────────
        # 1. Must be a reasonable fraction of the frame (not a tiny blob).
        if (bw * bh) / frame_area < 0.012:
            continue
        # 2. A standing/seated person is taller-than-wide-ish. Reject very
        #    wide, flat boxes (walls, desks, floor strips).
        if bh < bw * 0.85:
            continue
        # 3. Reject absurdly large boxes that cover almost the whole frame
        #    (typically a mis-fire on a uniform surface).
        if (bw * bh) / frame_area > 0.95:
            continue
        boxes.append((x1, y1, x2, y2))
    return boxes

def detect_persons_fallback(frame_bgr):
    """
    Fallback when YOLO not available: use MediaPipe face detection to infer
    person regions by expanding the face bounding box downward.
    """
    h, w = frame_bgr.shape[:2]
    rgb  = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    res  = face_detector.process(rgb)
    boxes = []
    if res.detections:
        for det in res.detections:
            b  = det.location_data.relative_bounding_box
            fx1 = max(0, int(b.xmin * w) - 10)
            fy1 = max(0, int(b.ymin * h) - 10)
            fx2 = min(w, int((b.xmin + b.width)  * w) + 10)
            fy2 = min(h, int((b.ymin + b.height) * h) + 10)
            face_h = fy2 - fy1
            # Extend down ~3x face height to include upper body
            body_y2 = min(h, fy2 + face_h * 3)
            pad_x   = int((fx2 - fx1) * 0.3)
            px1 = max(0, fx1 - pad_x)
            px2 = min(w, fx2 + pad_x)
            boxes.append((px1, fy1, px2, int(body_y2)))
    return boxes

# ════════════════════════════════════════════════════════════════════════════
#  POSE-BASED WRITING DETECTOR
# ════════════════════════════════════════════════════════════════════════════
PoseLandmark = mp_pose.PoseLandmark

def extract_pose_writing_features(landmarks, crop_h, crop_w):
    """
    Returns a dict of boolean/float pose features.
    All landmark coords are already relative to the crop.
    """
    def lm(idx):
        l = landmarks[idx]
        return np.array([l.x * crop_w, l.y * crop_h])

    def visible(idx, thr=0.4):
        return landmarks[idx].visibility > thr

    feats = {}

    # ── Head position ──
    if visible(PoseLandmark.NOSE):
        nose = lm(PoseLandmark.NOSE)
        feats["head_y_norm"] = nose[1] / crop_h   # 0=top,1=bottom
        # Head tilted forward (looking down) → nose.y > shoulder midpoint.y*0.8
        if visible(PoseLandmark.LEFT_SHOULDER) and visible(PoseLandmark.RIGHT_SHOULDER):
            ls = lm(PoseLandmark.LEFT_SHOULDER)
            rs = lm(PoseLandmark.RIGHT_SHOULDER)
            mid_shoulder_y = (ls[1] + rs[1]) / 2
            feats["head_down"] = nose[1] > mid_shoulder_y * 0.85
        else:
            feats["head_down"] = False
    else:
        feats["head_y_norm"] = 0.5
        feats["head_down"]   = False

    # ── Wrist positions relative to desk/hip ──
    wrist_down = False
    for wrist_idx, elbow_idx in [
        (PoseLandmark.LEFT_WRIST,  PoseLandmark.LEFT_ELBOW),
        (PoseLandmark.RIGHT_WRIST, PoseLandmark.RIGHT_ELBOW),
    ]:
        if visible(wrist_idx) and visible(elbow_idx):
            wrist = lm(wrist_idx)
            elbow = lm(elbow_idx)
            # Wrist lower than elbow → arm angled down (writing posture)
            if wrist[1] > elbow[1]:
                wrist_down = True
    feats["wrist_down"] = wrist_down

    # ── Arm close to body (not raised/gesturing) ──
    arm_close = False
    if visible(PoseLandmark.RIGHT_WRIST) and visible(PoseLandmark.RIGHT_SHOULDER):
        rw = lm(PoseLandmark.RIGHT_WRIST)
        rs = lm(PoseLandmark.RIGHT_SHOULDER)
        dist = abs(rw[0] - rs[0])
        arm_close = dist < crop_w * 0.3
    feats["arm_close"] = arm_close

    return feats

def classify_writing_pose(pose_feats, model_pred_writing: bool) -> str:
    """
    Combines model prediction with pose heuristics.
    Returns "Writing" or "Not Writing".
    """
    head_down  = pose_feats.get("head_down",   False)
    wrist_down = pose_feats.get("wrist_down",  False)
    arm_close  = pose_feats.get("arm_close",   False)

    # Pose score: each TRUE indicator adds weight
    pose_score = int(head_down) + int(wrist_down) + int(arm_close)

    if model_pred_writing and pose_score >= 1:
        return "Writing"
    if model_pred_writing and pose_score == 0:
        return "Writing"   # trust model if pose unclear
    if not model_pred_writing and pose_score >= 2:
        return "Writing"   # override model if pose is strongly writing
    return "Not Writing"

# ════════════════════════════════════════════════════════════════════════════
#  FACE DETECTION WITHIN A PERSON CROP
# ════════════════════════════════════════════════════════════════════════════
def detect_face_in_crop(crop_rgb):
    """
    Runs MediaPipe FaceDetection on a person crop.
    Returns (face_rgb, fx1, fy1, fx2, fy2) or (None, ...) if no face.
    """
    h, w = crop_rgb.shape[:2]
    res  = face_detector.process(crop_rgb)
    if not res.detections:
        return None, 0, 0, w, h   # fallback: use upper 40% of crop
    det  = res.detections[0]      # take largest/most confident
    b    = det.location_data.relative_bounding_box
    pad  = 0.15
    fx1  = max(0, int((b.xmin - pad * b.width)  * w))
    fy1  = max(0, int((b.ymin - pad * b.height) * h))
    fx2  = min(w, int((b.xmin + (1 + pad) * b.width)  * w))
    fy2  = min(h, int((b.ymin + (1 + pad) * b.height) * h))
    face = crop_rgb[fy1:fy2, fx1:fx2]
    if face.size == 0 or (fx2-fx1) < MIN_FACE_SIZE or (fy2-fy1) < MIN_FACE_SIZE:
        # Use upper-third of crop as fallback
        fy2 = h // 3
        face = crop_rgb[0:fy2, :]
    return face, fx1, fy1, fx2, fy2

def detect_talking(face_rgb):
    """Returns True if mouth is open (talking)."""
    if face_rgb is None or face_rgb.size == 0:
        return False
    res = face_mesher.process(face_rgb)
    if not res.multi_face_landmarks:
        return False
    fl  = res.multi_face_landmarks[0]
    ul  = fl.landmark[UPPER_LIP]
    ll  = fl.landmark[LOWER_LIP]
    return abs(ll.y - ul.y) > MOUTH_OPEN_THRESH

# ════════════════════════════════════════════════════════════════════════════
#  ATTENTION LOGIC  (Step 7)
# ════════════════════════════════════════════════════════════════════════════
# Emotion → semantic state mapping
EMOTION_STATE = {
    "happy":    "interested",
    "neutral":  "interested",
    "surprise": "interested",
    "sad":      "bored",
    "angry":    "bored",
    "disgust":  "bored",
    "fear":     "bored",
}

def compute_attention(writing, emotion, drowsy_label, talking):

    sleepy = drowsy_label in ("Closed_Eyes", "yawn")
    em_state = EMOTION_STATE.get(emotion, "neutral")


    # ==================================================
    # WRITING OVERRIDES EVERYTHING
    # ==================================================
    if writing == "Writing":
        return "Attentive", "Writing"


    # ==================================================
    # ONLY non-writing students can be not attentive
    # ==================================================
    if sleepy:
        return "Not Attentive", "Drowsy"

    if em_state == "bored":
        return "Not Attentive", f"Bored ({emotion})"

    if talking:
        return "Not Attentive", "Talking"


    # ==================================================
    # attentive defaults
    # ==================================================
    if em_state == "interested":
        return "Attentive", "Listening"

    return "Attentive", "Listening"

# ════════════════════════════════════════════════════════════════════════════
#  CENTROID TRACKER  (Step 6)
# ════════════════════════════════════════════════════════════════════════════
class CentroidTracker:
    """Tracks people across frames so the SAME person keeps the SAME id.

    Matching is done primarily by BOX OVERLAP (IoU), with centroid
    distance only as a secondary tie-breaker. IoU is far more stable than
    centroid distance for live (especially handheld phone) video: as long
    as a person's box overlaps their box from the previous frame, they are
    recognised as the same person — even if they move or the box jitters.
    This stops the count from climbing 1→2→3→4 for a single person.
    """
    def __init__(self, max_dist=MAX_TRACK_DIST, max_disappeared=20):
        self.next_id      = 1
        self.objects      = {}   # id → centroid
        self.boxes        = {}   # id → last box (x1,y1,x2,y2)
        self.disappeared  = {}   # id → frames since last seen
        self.max_dist     = max(max_dist, 200)   # generous distance fallback
        self.max_gone     = max_disappeared
        self.iou_thresh   = 0.25                 # boxes overlapping ≥25% = same person

    def _centroid(self, box):
        x1, y1, x2, y2 = box
        return np.array([(x1 + x2) // 2, (y1 + y2) // 2])

    @staticmethod
    def _iou(a, b):
        ax1, ay1, ax2, ay2 = a
        bx1, by1, bx2, by2 = b
        ix1, iy1 = max(ax1, bx1), max(ay1, by1)
        ix2, iy2 = min(ax2, bx2), min(ay2, by2)
        iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
        inter = iw * ih
        if inter <= 0:
            return 0.0
        area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
        area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
        union = area_a + area_b - inter
        return inter / union if union > 0 else 0.0

    def update(self, boxes):
        # No detections this frame — age out everyone.
        if not boxes:
            for oid in list(self.disappeared):
                self.disappeared[oid] += 1
                if self.disappeared[oid] > self.max_gone:
                    self.objects.pop(oid, None)
                    self.boxes.pop(oid, None)
                    self.disappeared.pop(oid, None)
            return {}

        new_centroids = [self._centroid(b) for b in boxes]

        # First ever frame — register everyone.
        if not self.objects:
            box_to_id = {}
            for i, b in enumerate(boxes):
                oid = self.next_id
                self.objects[oid]     = new_centroids[i]
                self.boxes[oid]       = b
                self.disappeared[oid] = 0
                box_to_id[i]          = oid
                self.next_id += 1
            return box_to_id

        oids = list(self.objects.keys())

        # ── Build a score for every (existing id, new box) pair ────────────
        # score = IoU (preferred). If two boxes don't overlap at all, fall
        # back to a centroid-distance score so a fast move still matches.
        pairs = []   # (score, is_iou, oid, col)
        for oid in oids:
            ob = self.boxes.get(oid)
            oc = self.objects[oid]
            for c, nb in enumerate(boxes):
                iou = self._iou(ob, nb) if ob is not None else 0.0
                if iou > 0:
                    pairs.append((iou, True, oid, c))
                else:
                    dist = float(np.linalg.norm(oc - new_centroids[c]))
                    if dist <= self.max_dist:
                        # convert distance to a 0..1 score (closer = higher)
                        pairs.append((1.0 - dist / self.max_dist, False, oid, c))

        # Greedily assign best matches first.
        pairs.sort(key=lambda p: p[0], reverse=True)
        used_oids, used_cols = set(), set()
        box_to_id = {}
        for score, is_iou, oid, c in pairs:
            if oid in used_oids or c in used_cols:
                continue
            if is_iou and score < self.iou_thresh:
                continue
            self.objects[oid]     = new_centroids[c]
            self.boxes[oid]       = boxes[c]
            self.disappeared[oid] = 0
            used_oids.add(oid)
            used_cols.add(c)
            box_to_id[c] = oid

        # Unmatched detections → genuinely new people.
        for c in range(len(boxes)):
            if c not in used_cols:
                oid = self.next_id
                self.objects[oid]     = new_centroids[c]
                self.boxes[oid]       = boxes[c]
                self.disappeared[oid] = 0
                box_to_id[c]          = oid
                self.next_id += 1

        # Unmatched existing ids → age them out.
        for oid in oids:
            if oid not in used_oids:
                self.disappeared[oid] += 1
                if self.disappeared[oid] > self.max_gone:
                    self.objects.pop(oid, None)
                    self.boxes.pop(oid, None)
                    self.disappeared.pop(oid, None)

        return box_to_id   # box_index → student_id

# ════════════════════════════════════════════════════════════════════════════
#  PER-STUDENT STATE TRACKER  (Step 8 — temporal voting)
# ════════════════════════════════════════════════════════════════════════════
class StudentState:
    def __init__(self, sid):
        self.sid       = sid
        self.attention = deque(maxlen=TEMPORAL_WINDOW)
        self.writing   = deque(maxlen=TEMPORAL_WINDOW)
        self.emotion   = deque(maxlen=TEMPORAL_WINDOW)
        self.reason    = deque(maxlen=TEMPORAL_WINDOW)
        # Last confirmed labels (for display when student not visible)
        self.last_attention = "Unknown"
        self.last_writing   = "?"
        self.last_emotion   = "?"
        self.last_reason    = ""

    def update(self, attention, writing, emotion, reason):
        self.attention.append(attention)
        self.writing.append(writing)
        self.emotion.append(emotion)
        self.reason.append(reason)
        self.last_attention = Counter(self.attention).most_common(1)[0][0]
        self.last_writing   = Counter(self.writing).most_common(1)[0][0]
        self.last_emotion   = Counter(self.emotion).most_common(1)[0][0]
        self.last_reason    = Counter(self.reason).most_common(1)[0][0]

    @property
    def dominant_attention(self):
        if not self.attention:
            return "Unknown"
        c = Counter(self.attention)
        total = len(self.attention)
        attentive_pct = c.get("Attentive", 0) / total
        return "Attentive" if attentive_pct >= 0.5 else "Not Attentive"

# ════════════════════════════════════════════════════════════════════════════
#  DRAWING HELPERS
# ════════════════════════════════════════════════════════════════════════════
COLOR_ATTENTIVE     = (0, 210, 0)
COLOR_NOT_ATTENTIVE = (0, 50, 220)
COLOR_UNKNOWN       = (180, 180, 180)

def box_color(attention):
    if attention == "Attentive":     return COLOR_ATTENTIVE
    if attention == "Not Attentive": return COLOR_NOT_ATTENTIVE
    return COLOR_UNKNOWN

def draw_student(frame,sid,x1,y1,x2,y2,state,
                 writing,emotion,attention,reason):

    final_label = state.dominant_attention

    if final_label=="Attentive":
        col=(0,255,0)
        label="Attentive"

    else:
        col=(0,0,255)
        label="Not Attentive"

    cv2.rectangle(
        frame,
        (x1,y1),
        (x2,y2),
        col,
        2
    )

    cv2.putText(
        frame,
        f"S{sid}",
        (x1,max(30,y1-35)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        col,
        2
    )

    (tw,th),_=cv2.getTextSize(
        label,
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        2
    )

    cv2.rectangle(
        frame,
        (x1,y1-th-12),
        (x1+tw+10,y1),
        col,
        -1
    )

    cv2.putText(
        frame,
        label,
        (x1+5,y1-5),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (255,255,255),
        2
    )

def draw_hud(frame, students: dict, fps):

    total=len(students)

    attentive=sum(
        1 for s in students.values()
        if s.dominant_attention=="Attentive"
    )

    not_att=total-attentive

    score=(attentive/total*100) if total else 0

    cls_label="Attentive" if score>=50 else "Not Attentive"


    # unique reasons only
    active_reasons=[]

    for s in students.values():

        if s.dominant_attention=="Not Attentive":

            r=s.last_reason

            if "Drowsy" in r and "Drowsy" not in active_reasons:
                active_reasons.append("Drowsy")

            elif "Bored" in r and "Bored" not in active_reasons:
                active_reasons.append("Bored")

            elif "Talking" in r and "Talking" not in active_reasons:
                active_reasons.append("Talking")


    lines=[
        "CLASSROOM MONITOR",
        f"Students   : {total}",
        f"Attentive  : {attentive}",
        f"Not Att.   : {not_att}",
        f"Class Score: {score:.0f}%",
        f"Class State: {cls_label}",
        "Reasons:"
    ]

    if not active_reasons:
        lines.append("None")

    for r in active_reasons:
        lines.append(r)


    fnt=cv2.FONT_HERSHEY_SIMPLEX

    lh=22
    pad=8
    pw=260
    ph=len(lines)*lh + pad*2

    panel=frame.copy()

    cv2.rectangle(
        panel,
        (0,0),
        (pw,ph),
        (15,15,15),
        -1
    )

    cv2.addWeighted(
        panel,
        0.70,
        frame,
        0.30,
        0,
        frame
    )


    for i,txt in enumerate(lines):

        cv2.putText(
            frame,
            txt,
            (8,pad+(i+1)*lh-4),
            fnt,
            0.50,
            (255,255,255),
            1,
            cv2.LINE_AA
        )


    cv2.line(
        frame,
        (0,ph),
        (pw,ph),
        (80,80,80),
        1
    )

# ════════════════════════════════════════════════════════════════════════════
#  OUTPUT PATH BUILDER
# ════════════════════════════════════════════════════════════════════════════
def build_paths(source):
    ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
    stem = "webcam" if isinstance(source, int) \
           else os.path.splitext(os.path.basename(source))[0]
    base = os.path.join(OUTPUT_DIR, f"{stem}_{ts}")
    return f"{base}_output.mp4", f"{base}_log.json"

# ════════════════════════════════════════════════════════════════════════════
#  MAIN RUN LOOP
# ════════════════════════════════════════════════════════════════════════════
def run(source):
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open: {source}")
        return

    fps_cap = cap.get(cv2.CAP_PROP_FPS) or 25.0
    W       = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H       = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration_sec = (total_frames / fps_cap) if (fps_cap and total_frames) else 0.0
    vout, jout = build_paths(source)
    # Writer is created lazily on the first processed frame, so its size
    # matches the (possibly downscaled) frame we actually analyse/draw on.
    writer = None

    # ── Video details printed to the TERMINAL running this analysis ──────────
    # (This block only appears in the console / terminal, not in the dashboard.)
    print("=" * 70)
    print("VIDEO DETAILS")
    print("=" * 70)
    print(f"  Name        : {os.path.basename(str(source))}")
    print(f"  Path        : {source}")
    print(f"  Resolution  : {W} x {H}")
    print(f"  FPS         : {fps_cap:.2f}")
    print(f"  Frame count : {total_frames}")
    print(f"  Duration    : {duration_sec:.1f} sec  ({duration_sec/60:.2f} min)")
    print("=" * 70, flush=True)
    print(f"[INFO] Output → {vout}")

    tracker   = CentroidTracker()
    students  = {}    # sid → StudentState
    frame_idx = 0
    logs      = []
    t_prev    = time.time()
    fps_disp  = 0.0

    # Cache last-frame person boxes for skipped frames
    cached_boxes = []
    first_frame  = True   # always detect on very first frame

    # Optional cap on how many frames to process — keeps analysis fast on
    # long videos. 0 = no cap (process the whole video). Set via the
    # ANALYSIS_MAX_FRAMES env var (Flask can pass this).
    try:
        max_frames = int(os.environ.get('ANALYSIS_MAX_FRAMES', '0'))
    except Exception:
        max_frames = 0

    print("[INFO] Running — press Q to quit")
    # Speed: downscale very large frames before analysis. Faces stay well
    # above the minimum detectable size, so accuracy is preserved, but YOLO
    # and the classifiers run on far fewer pixels = much faster. Tune via
    # ANALYSIS_MAX_WIDTH (0 disables). Default targets ~960px wide.
    try:
        max_proc_width = int(os.environ.get('ANALYSIS_MAX_WIDTH', '960'))
    except Exception:
        max_proc_width = 960
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1
        if max_frames and frame_idx > max_frames:
            print(f"[INFO] Reached ANALYSIS_MAX_FRAMES={max_frames} — stopping early.")
            break

        # downscale large frames (keeps aspect ratio; only shrinks, never grows)
        if max_proc_width and frame.shape[1] > max_proc_width:
            _scale = max_proc_width / float(frame.shape[1])
            frame = cv2.resize(frame, (max_proc_width, int(frame.shape[0] * _scale)),
                               interpolation=cv2.INTER_AREA)

        if frame_idx % 30 == 0:
            total=len(students)
            attentive=sum(
                1 for s in students.values()
                if s.dominant_attention=="Attentive"
            )

            not_att=total-attentive
            score=(attentive/total*100) if total else 0

            state="Attentive" if score>=50 else "Not Attentive"

            print(
            f"[FRAME {frame_idx}] "
            f"Students={total}, "
            f"Attentive={attentive}, "
            f"NotAtt={not_att}, "
            f"Score={score:.0f}%, "
            f"State={state}"
            )


        t_now    = time.time()
        fps_disp = 1.0 / max(t_now - t_prev, 1e-6)
        t_prev   = t_now

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # ── STEP 1: Person Detection ─────────────────────────────────────
        if first_frame or frame_idx % SKIP_FRAMES == 0:
            if yolo_model is not None:
                person_boxes = detect_persons_yolo(frame)
            else:
                person_boxes = detect_persons_fallback(frame)
            cached_boxes = person_boxes
            first_frame  = False
        else:
            person_boxes = cached_boxes

        # ── STEP 6: Track persons ────────────────────────────────────────
        box_to_id = tracker.update(person_boxes)

        # Clean up students that the tracker has dropped (no longer visible)
        active_ids = set(tracker.objects.keys())
        for old_id in list(students.keys()):
            if old_id not in active_ids:
                del students[old_id]

        # Only run the EXPENSIVE per-student pipeline (face detection, pose
        # estimation, 3 CNN predictions) on detection frames. On skipped
        # frames we just redraw each student with their last confirmed
        # labels. Temporal voting (15-frame window) is unaffected, so the
        # result is the same — but CPU work drops ~SKIP_FRAMES×, which is
        # the real cause of slow theory/tutorial analysis with many students.
        run_heavy = (first_frame or frame_idx % SKIP_FRAMES == 0)

        frame_log_students = []

        for box_idx, (px1, py1, px2, py2) in enumerate(person_boxes):
            sid = box_to_id.get(box_idx)
            if sid is None:
                # No stable tracker id — skip rather than invent a
                # colliding id that would inflate the student count.
                continue

            if sid not in students:
                students[sid] = StudentState(sid)

            if not run_heavy:
                # Lightweight path: redraw using the student's last labels.
                st = students[sid]
                draw_student(
                    frame, sid,
                    px1, py1, px2, py2,
                    st,
                    st.last_writing, st.last_emotion,
                    st.dominant_attention, st.last_reason,
                )
                continue

            # ── Crop person region ──────────────────────────────────────
            person_crop_rgb = rgb[py1:py2, px1:px2]
            if person_crop_rgb.size == 0:
                continue
            ph_c, pw_c = person_crop_rgb.shape[:2]

            # ── STEP 2: Face detection inside person crop ───────────────
            face_rgb, fx1, fy1, fx2, fy2 = detect_face_in_crop(person_crop_rgb)
            has_face = (face_rgb is not None and face_rgb.size > 0
                        and face_rgb.shape[0] >= MIN_FACE_SIZE
                        and face_rgb.shape[1] >= MIN_FACE_SIZE)

            # ── STEP 3: Pose estimation on person crop ──────────────────
            pose_res   = pose_estimator.process(person_crop_rgb)
            pose_feats = {}
            if pose_res.pose_landmarks:
                pose_feats = extract_pose_writing_features(
                    pose_res.pose_landmarks.landmark, ph_c, pw_c)

            # ── STEP 4: Writing classification ──────────────────────────
            # Always run on full person crop (face presence doesn't change this)
            w_idx, _ = predict(writing_model, person_crop_rgb, grayscale=False)
            model_writing = (WRITING_CLASSES[w_idx] == "writing")
            writing_label = classify_writing_pose(pose_feats, model_writing)

            # ── STEP 5: Emotion + Drowsy detection ──────────────────────
            if has_face:
                d_idx, _ = predict(drowsy_model,  face_rgb, grayscale=True)
                e_idx, _ = predict(emotion_model, face_rgb, grayscale=True)
                talking  = detect_talking(face_rgb)
                drowsy_label  = DROWSY_CLASSES[d_idx]
                emotion_label = EMOTION_CLASSES[e_idx]
            else:
                # No face found — use safe defaults; writing model still runs on body
                drowsy_label  = "Open_Eyes"
                emotion_label = "neutral"   # assume calm, not excited/bored
                talking       = False

            # ── STEP 7: Attention classification ────────────────────────
            attention, reason = compute_attention(
                writing_label, emotion_label, drowsy_label, talking)

            # ── STEP 8: Update temporal state ───────────────────────────
            students[sid].update(attention, writing_label, emotion_label, reason)

            # ── STEP 9: Draw annotations ─────────────────────────────────
            draw_student(
                frame, sid,
                px1, py1, px2, py2,
                students[sid],
                writing_label, emotion_label, attention, reason,
            )

            # Draw face sub-box if found
            # if has_face:
            #     abs_fx1 = px1 + fx1
            #     abs_fy1 = py1 + fy1
            #     abs_fx2 = px1 + fx2
            #     abs_fy2 = py1 + fy2
            #     cv2.rectangle(frame, (abs_fx1, abs_fy1),
            #                   (abs_fx2, abs_fy2), (255, 200, 0), 1)

            frame_log_students.append({
                "student_id":  sid,
                "writing":     writing_label,
                "emotion":     emotion_label,
                "drowsy":      drowsy_label,
                "talking":     talking,
                "attention":   attention,
                "dominant":    students[sid].dominant_attention,
                "reason":      reason,
            })

        # ── HUD ──────────────────────────────────────────────────────────
        draw_hud(frame, students, fps_disp)

        # Lazily create the writer to match the actual processed frame size
        # (handles downscaling correctly).
        if writer is None:
            fh, fw = frame.shape[:2]
            writer = cv2.VideoWriter(vout, cv2.VideoWriter_fourcc(*"mp4v"),
                                     fps_cap, (fw, fh))
        writer.write(frame)
        logs.append({"frame": frame_idx, "students": frame_log_students})

        # The live preview window is intentionally NOT shown here. A popup
        # layered over the dashboard was distracting; instead the fully
        # annotated video is saved and then opened in its own separate
        # OS window (its own taskbar entry) after analysis — see below.
        # Set SHOW_LIVE_WINDOW=1 if you still want the old live popup.
        if os.environ.get("SHOW_LIVE_WINDOW", "0").strip() in ("1", "true", "True"):
            cv2.imshow("Classroom Monitor", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    if writer is not None:
        writer.release()
    cv2.destroyAllWindows()

    with open(jout, "w") as f:
        json.dump({"source": str(source), "frames": logs}, f, indent=2)

    final_total=len(students)

    final_att=sum(
        1 for s in students.values()
        if s.dominant_attention=="Attentive"
    )

    final_not=final_total-final_att

    score=(final_att/final_total*100) if final_total else 0


    reasons=[]

    for s in students.values():

        if s.dominant_attention=="Not Attentive":

            r=s.last_reason

            if "Drowsy" in r and "Drowsy" not in reasons:
                reasons.append("Drowsy")

            elif "Bored" in r and "Bored" not in reasons:
                reasons.append("Bored")

            elif "Talking" in r and "Talking" not in reasons:
                reasons.append("Talking")


    print("\n"+"="*70)
    print("FINAL ANALYSIS REPORT")
    print("="*70)

    print(f"Input Video      : {os.path.basename(source)}")
    

    print("\nStudents Summary")
    print("-"*70)

    print(f"Total Students   : {final_total}")
    print(f"Attentive        : {final_att}")
    print(f"Not Attentive    : {final_not}")

    print("\nBehavior Distribution")

    print(
    f"Attentive     [{'█'*int(score/5):<20}] {score:.1f}%"
    )

    print(
    f"Not Attentive [{'█'*int((100-score)/5):<20}] {100-score:.1f}%"
    )

    print("\nReasons:")

    if not reasons:
        print("None")

    for r in reasons:
        print(f"• {r}")

    print("\nOutput Video:",vout)
    print("Output Log  :",jout)

    print("="*70)

    # ── Open the annotated video in its OWN separate window / taskbar entry ──
    # The dashboard result is unaffected; this just makes the boxed+labelled
    # video available as a window the user can open if they want to.
    try:
        import sys as _sys, os as _os
        _sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
        from annotated_viewer import open_annotated
        open_annotated(vout)
    except Exception as _e:
        print(f"[ANNOTATED] viewer unavailable: {_e}")



# =========================================================
# ENTRY POINT - auto pick random video from folder
# =========================================================

import os
import glob
import random


if __name__ == "__main__":

    print("\n" + "="*50)
    print(" Classroom Monitor — Random Video Mode ")
    print("="*50)

    # Folder containing videos
    VIDEO_FOLDER = r"C:\Users\User\Desktop\all_int_die\videos"


    # Supported video formats
    exts = [
        "*.mp4",
        "*.avi",
        "*.mov",
        "*.mkv"
    ]


    # Collect videos
    video_list = []

    for e in exts:

        video_list.extend(
            glob.glob(
                os.path.join(
                    VIDEO_FOLDER,
                    e
                )
            )
        )


    # No videos found
    if not video_list:

        print("[ERROR] No videos found in folder:")
        print(VIDEO_FOLDER)
        exit()


    # Pick random video
    src = random.choice(video_list)


    print("\n[INFO] Random video selected:")
    print(src)


    # Run inference
    run(src)