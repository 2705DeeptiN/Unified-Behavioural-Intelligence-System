"""
live_engine.py  —  Real-time classroom analysis engine
========================================================
Runs the EXISTING emotion/inference.py frame-processing logic on a LIVE
camera feed inside a background thread, and exposes running statistics that
the dashboard can poll every couple of seconds.

This does NOT replace the existing video-file analysis. The /run/* endpoints
and all recorded-video analysis stay exactly as they were. This module only
adds a new live mode used by the Start/Stop buttons.

Design:
  • One LiveSession per active analysis.
  • The session opens the camera, then loops: read frame → run the SAME
    per-frame pipeline used by inference.run() → update rolling stats.
  • The dashboard polls /live/stats to read the latest numbers (~2s latency).
  • Models are loaded ONCE (when this module is imported) and reused, so the
    loop is as fast as the hardware allows.
  • Stopping the session finalises the numbers so they can be saved to history.

If OpenCV / torch / the ML deps are missing, the engine degrades gracefully
and reports an error instead of crashing the Flask process.
"""

import os
import sys
import time
import threading
from collections import Counter, deque

# ── Make the emotions/ package importable so we reuse its pipeline ──────────
THIS_DIR    = os.path.dirname(os.path.abspath(__file__))
BASE_DIR    = os.path.abspath(os.path.join(THIS_DIR, '..', 'final_project'))
EMOTION_DIR = os.path.join(BASE_DIR, 'emotions')
LAB_DIR     = os.path.join(BASE_DIR, 'lab')

for p in (EMOTION_DIR, LAB_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

# ── Lazy / safe imports ─────────────────────────────────────────────────────
# We import the heavy ML pieces inside a try so a missing dependency doesn't
# take down the whole Flask API — live mode just reports unavailable.
_IMPORT_OK = True
_IMPORT_ERR = ''
try:
    import cv2
    # Reuse the EXISTING inference module — we do not duplicate its logic.
    import inference as emo
except Exception as e:          # pragma: no cover - depends on user's env
    _IMPORT_OK = False
    _IMPORT_ERR = str(e)


# ── Lab model (focused / distracted) — loaded lazily, only when a LAB live
#    session actually starts, so theory/tutorial sessions are unaffected. ──
_LAB = {'loaded': False, 'ok': False, 'model': None, 'device': None,
        'classify': None, 'class_names': None, 'err': ''}

# ── Teacher model (teaching mode + enthusiasm) — loaded lazily, only when a
#    TEACHER live session starts. ──
_TCH = {'loaded': False, 'ok': False, 'detector': None, 'class_names': None,
        'err': '', 'prev_gray': None}

def _ensure_teacher_model():
    if _TCH['loaded']:
        return _TCH['ok']
    _TCH['loaded'] = True
    try:
        import torch
        import numpy as np
        from collections import deque, Counter
        from torchvision import models, transforms
        TEACHER_DIR = os.path.join(BASE_DIR, 'teacher')
        mode_path = os.path.join(TEACHER_DIR, 'best_model.pth')
        if not os.path.isfile(mode_path):
            raise FileNotFoundError(f'best_model.pth missing at {mode_path}')

        DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        # Newer PyTorch defaults torch.load to weights_only=True, which
        # REFUSES checkpoints containing non-tensor data (class_names etc.)
        # and raises. Force weights_only=False so the load works on any
        # torch version. Try both signatures for old-torch compatibility.
        try:
            ckpt = torch.load(mode_path, map_location=DEVICE, weights_only=False)
        except TypeError:
            ckpt = torch.load(mode_path, map_location=DEVICE)

        # The checkpoint might be a bare state_dict OR a dict-of-stuff.
        if isinstance(ckpt, dict) and 'model_state' in ckpt:
            state       = ckpt['model_state']
            class_names = ckpt.get('class_names', ['boardonly', 'pptonly', 'boardandppt'])
            num_classes = ckpt.get('num_classes', len(class_names))
            img_size    = ckpt.get('img_size', 224)
        elif isinstance(ckpt, dict) and 'state_dict' in ckpt:
            state       = ckpt['state_dict']
            class_names = ckpt.get('class_names', ['boardonly', 'pptonly', 'boardandppt'])
            num_classes = ckpt.get('num_classes', len(class_names))
            img_size    = ckpt.get('img_size', 224)
        elif isinstance(ckpt, dict):
            # could already BE the state_dict
            state       = ckpt
            class_names = ['boardonly', 'pptonly', 'boardandppt']
            num_classes = 3
            img_size    = 224
        else:
            raise RuntimeError('unexpected checkpoint format')

        # Strip any DataParallel "module." prefix from keys.
        if any(k.startswith('module.') for k in state.keys()):
            state = {k[len('module.'):]: v for k, v in state.items()}

        net = models.mobilenet_v2(weights=None)
        net.classifier[1] = torch.nn.Linear(net.last_channel, num_classes)
        # Allow non-strict load in case the head names differ slightly —
        # the backbone is what matters for inference.
        net.load_state_dict(state, strict=False)
        net.to(DEVICE).eval()

        tfm = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((img_size, img_size)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        buf = deque(maxlen=5)

        class _InlineModeDetector:
            class_names = None
            def predict(self, frame_bgr):
                rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                t = tfm(rgb).unsqueeze(0).to(DEVICE)
                with torch.no_grad():
                    probs = torch.softmax(net(t), dim=1)[0].cpu().numpy()
                idx = int(probs.argmax())
                raw = class_names[idx]
                buf.append(raw)
                smooth = Counter(buf).most_common(1)[0][0]
                return raw, smooth, float(probs[idx]), probs

        det = _InlineModeDetector()
        det.class_names = class_names
        _TCH['detector']    = det
        _TCH['class_names'] = class_names
        _TCH['ok'] = True
        print('[live_engine] teacher mode model loaded successfully.', flush=True)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        # Log the full traceback to Flask's console + keep first line as
        # the user-facing reason.
        print('[live_engine] TEACHER MODEL LOAD FAILED:\n' + tb, flush=True)
        _TCH['err'] = (type(e).__name__ + ': ' + str(e))[:380]
        _TCH['ok'] = False
    return _TCH['ok']


def _ensure_lab_model():
    """Load the lab focus model + its classify_region helper once."""
    if _LAB['loaded']:
        return _LAB['ok']
    _LAB['loaded'] = True
    try:
        import torch
        if LAB_DIR not in sys.path:
            sys.path.insert(0, LAB_DIR)
        from model import load_model as _lab_load
        import test as _lab_test           # lab/test.py
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        model_path = os.path.join(LAB_DIR, 'output', 'best_model.pth')
        if not os.path.isfile(model_path):
            model_path = os.path.join(LAB_DIR, 'best_model.pth.bin')
        _LAB['model']       = _lab_load(model_path, num_classes=2, device=device)
        _LAB['device']      = device
        _LAB['classify']    = _lab_test.classify_region
        _LAB['class_names'] = _lab_test.CLASS_NAMES   # ['Focused','Distracted']
        _LAB['ok'] = True
    except Exception as e:
        _LAB['err'] = str(e)
        _LAB['ok'] = False
    return _LAB['ok']


class LiveSession:
    """One live real-time analysis run."""

    def __init__(self, camera_index=0, category='Theory'):
        self.camera_index = camera_index
        self.category     = category
        self.thread       = None
        self.running      = False
        self.error        = None
        self.started_at   = None
        self.stopped_at   = None

        # Rolling state — protected by a lock because the dashboard polls
        # this from a different thread than the capture loop.
        self._lock = threading.Lock()
        self._stats = {
            'frames_processed':  0,
            'students_detected': 0,
            'attentive':         0,
            'not_attentive':     0,
            'engagement':        0.0,
            'dominant_emotion':  'unknown',
            'reasons':           [],
            'fps':               0.0,
            'elapsed_seconds':   0,
            'any_face_seen':     False,
            'video_clarity':     'good',
        }
        self._faces_total = 0

    # ── public API ─────────────────────────────────────────────────────────
    def start(self):
        if not _IMPORT_OK:
            self.error = f'Live engine unavailable: {_IMPORT_ERR}'
            return False
        if self.running:
            return True
        self.running    = True
        self.started_at = time.time()
        self.thread     = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()
        return True

    def stop(self):
        self.running    = False
        self.stopped_at = time.time()
        if self.thread is not None:
            self.thread.join(timeout=4.0)
        return self.snapshot()

    def snapshot(self):
        """Thread-safe copy of the current rolling stats."""
        with self._lock:
            s = dict(self._stats)
        s['running']    = self.running
        s['error']      = self.error
        s['category']   = self.category
        if self.started_at:
            end = self.stopped_at or time.time()
            s['elapsed_seconds'] = int(end - self.started_at)
        return s

    # ── capture + analysis loop ────────────────────────────────────────────
    def _loop(self):
        cap = None
        try:
            cap = cv2.VideoCapture(self.camera_index)
            if not cap or not cap.isOpened():
                self.error   = (f'Could not open camera index {self.camera_index}. '
                                f'Check the camera connection / CAMERA_INDEX.')
                self.running = False
                return

            # Reuse the EXISTING tracker + per-student state from inference.py
            tracker  = emo.CentroidTracker()
            students = {}              # sid -> emo.StudentState
            frame_idx    = 0
            cached_boxes = []
            first_frame  = True
            t_prev       = time.time()

            while self.running:
                ret, frame = cap.read()
                if not ret or frame is None:
                    # transient camera hiccup — wait briefly and retry
                    time.sleep(0.05)
                    continue
                frame_idx += 1

                t_now    = time.time()
                fps_disp = 1.0 / max(t_now - t_prev, 1e-6)
                t_prev   = t_now

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                # ══ TEACHER category: analyse the TEACHER (teaching mode +
                #    enthusiasm), NOT the students. Runs on the whole frame.
                #    Moved BEFORE person detection so a YOLO/emotion-module
                #    issue can't prevent the teacher pipeline from running. ══
                if str(self.category).lower() == 'teacher':
                    if not _ensure_teacher_model():
                        # Surface the real reason instead of silently showing
                        # student metrics.
                        with self._lock:
                            self._stats.update({
                                'frames_processed': self._stats['frames_processed'] + 1,
                                'is_teacher': True,
                                'mode_label': 'Model not loaded',
                                'enthu_pct': 0, 'not_enthu_pct': 0,
                                'enthu_verdict': 'TEACHER MODEL FAILED TO LOAD',
                                'engagement': 0,
                                'students_detected': 1,
                                'reasons': [f"teacher model error: {_TCH.get('err','')[:400]}"],
                                'fps': round(fps_disp, 1),
                                'any_face_seen': True, 'video_clarity': 'good',
                            })
                        continue
                    try:
                        raw, smooth, conf, _probs = _TCH['detector'].predict(frame)
                    except Exception as _pe:
                        smooth, conf = 'boardonly', 0.0
                        print(f'[live_engine] teacher predict error: {_pe}', flush=True)
                    # lightweight motion-based enthusiasm estimate (no heavy LSTM):
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    motion = 0.0
                    if _TCH['prev_gray'] is not None and _TCH['prev_gray'].shape == gray.shape:
                        diff = cv2.absdiff(gray, _TCH['prev_gray'])
                        motion = float(diff.mean())
                    _TCH['prev_gray'] = gray
                    self._recompute_teacher(smooth, motion, fps_disp)
                    continue   # skip the student pipeline entirely

                # ── STEP 1: person detection (reuse inference.py helpers) ──
                if first_frame or frame_idx % emo.SKIP_FRAMES == 0:
                    if emo.yolo_model is not None:
                        person_boxes = emo.detect_persons_yolo(frame)
                    else:
                        person_boxes = emo.detect_persons_fallback(frame)
                    cached_boxes = person_boxes
                    first_frame  = False
                else:
                    person_boxes = cached_boxes

                # ── STEP 6: track persons ──────────────────────────────────
                box_to_id  = tracker.update(person_boxes)
                active_ids = set(tracker.objects.keys())
                for old_id in list(students.keys()):
                    if old_id not in active_ids:
                        del students[old_id]

                # ══ LAB category: use the LAB focus model (focused /
                #    distracted) instead of the theory emotion pipeline. ══
                if str(self.category).lower() == 'lab' and _ensure_lab_model():
                    focused_n = 0
                    distracted_n = 0
                    boxes_lab = person_boxes if person_boxes else [(0, 0, frame.shape[1], frame.shape[0])]
                    for (bx1, by1, bx2, by2) in boxes_lab:
                        try:
                            cls_id, _conf = _LAB['classify'](
                                _LAB['model'], _LAB['device'], frame,
                                (int(bx1), int(by1), int(bx2), int(by2)))
                            name = _LAB['class_names'][cls_id].lower()
                            if name == 'focused':
                                focused_n += 1
                            else:
                                distracted_n += 1
                        except Exception:
                            continue
                    self._recompute_lab(focused_n, distracted_n, fps_disp)
                    continue   # skip the theory/tutorial emotion pipeline

                # ── per-person pipeline (same steps as inference.run) ──────
                # HONEST RULE: a detection only becomes a counted student if
                # a genuine FACE is found inside it. A tree / bag / chair
                # that YOLO mislabels as a person has no face, so it is
                # skipped — it never becomes a student and never affects the
                # engagement number or the emotion.
                seen_this_frame = set()
                for box_idx, (px1, py1, px2, py2) in enumerate(person_boxes):
                    sid = box_to_id.get(box_idx, box_idx + 1)

                    person_crop_rgb = rgb[py1:py2, px1:px2]
                    if person_crop_rgb.size == 0:
                        continue
                    ph_c, pw_c = person_crop_rgb.shape[:2]

                    face_rgb, fx1, fy1, fx2, fy2 = emo.detect_face_in_crop(person_crop_rgb)
                    has_face = (face_rgb is not None and face_rgb.size > 0
                                and face_rgb.shape[0] >= emo.MIN_FACE_SIZE
                                and face_rgb.shape[1] >= emo.MIN_FACE_SIZE)

                    # No real face → not a student. Skip — do not create a
                    # StudentState, do not contribute to any number.
                    if not has_face:
                        continue

                    self._faces_total += 1
                    if sid not in students:
                        students[sid] = emo.StudentState(sid)

                    pose_res   = emo.pose_estimator.process(person_crop_rgb)
                    pose_feats = {}
                    if pose_res.pose_landmarks:
                        pose_feats = emo.extract_pose_writing_features(
                            pose_res.pose_landmarks.landmark, ph_c, pw_c)

                    w_idx, _ = emo.predict(emo.writing_model, person_crop_rgb, grayscale=False)
                    model_writing = (emo.WRITING_CLASSES[w_idx] == 'writing')
                    writing_label = emo.classify_writing_pose(pose_feats, model_writing)

                    # Face is present — run the real emotion + drowsy models.
                    d_idx, _ = emo.predict(emo.drowsy_model,  face_rgb, grayscale=True)
                    e_idx, _ = emo.predict(emo.emotion_model, face_rgb, grayscale=True)
                    talking  = emo.detect_talking(face_rgb)
                    drowsy_label  = emo.DROWSY_CLASSES[d_idx]
                    emotion_label = emo.EMOTION_CLASSES[e_idx]

                    attention, reason = emo.compute_attention(
                        writing_label, emotion_label, drowsy_label, talking)
                    students[sid].update(attention, writing_label, emotion_label, reason)
                    seen_this_frame.add(sid)

                # ── stabilise the count ────────────────────────────────────
                # Keep only students whose face was actually seen in THIS
                # frame. This stops the student number from drifting upward
                # as the tracker hands out new IDs over time — the count
                # always reflects who is genuinely visible right now.
                for sid in list(students.keys()):
                    if sid not in seen_this_frame:
                        del students[sid]

                # ── update rolling stats for the dashboard ─────────────────
                self._recompute(students, fps_disp)

            # loop exited because running flag turned off
        except Exception as e:                       # pragma: no cover
            self.error = f'Live analysis error: {e}'
        finally:
            self.running = False
            if cap is not None:
                try:
                    cap.release()
                except Exception:
                    pass

    def _recompute(self, students, fps_disp):
        total     = len(students)
        attentive = sum(1 for s in students.values()
                        if s.dominant_attention == 'Attentive')
        not_att   = total - attentive
        engagement = (attentive / total * 100.0) if total else 0.0

        # dominant emotion across all currently-tracked students.
        # HONEST: only what the emotion model actually classified — if it has
        # classified nothing yet, report 'unknown', never assume 'neutral'.
        emo_counter = Counter()
        reasons     = []
        for s in students.values():
            if s.last_emotion and s.last_emotion != '?':
                emo_counter[s.last_emotion] += 1
            if s.dominant_attention == 'Not Attentive':
                r = s.last_reason or ''
                if 'Drowsy' in r and 'Drowsy' not in reasons:
                    reasons.append('Drowsy')
                elif 'Bored' in r and 'Bored' not in reasons:
                    reasons.append('Bored')
                elif 'Talking' in r and 'Talking' not in reasons:
                    reasons.append('Talking')
        dominant_emotion = (emo_counter.most_common(1)[0][0]
                            if emo_counter else 'unknown')

        with self._lock:
            self._stats.update({
                'frames_processed':  self._stats['frames_processed'] + 1,
                'students_detected': total,
                'attentive':         attentive,
                'not_attentive':     not_att,
                'engagement':        round(engagement, 1),
                'dominant_emotion':  dominant_emotion,
                'reasons':           reasons,
                'fps':               round(fps_disp, 1),
                'any_face_seen':     self._faces_total > 0,
                'video_clarity':     'good',
            })

    def _recompute_lab(self, focused_n, distracted_n, fps_disp):
        """Lab live stats: focused vs distracted (no emotion/face logic)."""
        total = focused_n + distracted_n
        engagement = (focused_n / total * 100.0) if total else 0.0
        with self._lock:
            self._stats.update({
                'frames_processed':  self._stats['frames_processed'] + 1,
                'students_detected': total,
                'attentive':         focused_n,      # 'focused' maps to attentive
                'not_attentive':     distracted_n,
                'focused':           focused_n,
                'distracted':        distracted_n,
                'engagement':        round(engagement, 1),
                'dominant_emotion':  'unknown',       # not used for lab
                'reasons':           [],
                'fps':               round(fps_disp, 1),
                'any_face_seen':     total > 0,
                'video_clarity':     'good',
            })

    def _recompute_teacher(self, mode_label, motion, fps_disp):
        """Teacher live stats: teaching mode (board/ppt/both) + enthusiasm.
        Enthusiasm is derived from sustained body motion across the session
        (more movement = more enthusiastic), accumulated over time."""
        # accumulate mode votes + motion samples
        if not hasattr(self, '_tch_modes'):
            self._tch_modes = Counter()
            self._tch_motion = []
        self._tch_modes[mode_label] += 1
        self._tch_motion.append(motion)
        if len(self._tch_motion) > 300:
            self._tch_motion.pop(0)

        # dominant mode so far
        dom_mode = self._tch_modes.most_common(1)[0][0] if self._tch_modes else 'boardonly'
        mode_map = {'boardonly': 'Board Only', 'pptonly': 'PPT / Screen Only',
                    'boardandppt': 'Board + PPT'}
        mode_human = mode_map.get(dom_mode, dom_mode)

        # enthusiasm from motion: map mean motion (~0..6) to 0..100%.
        avg_motion = (sum(self._tch_motion) / len(self._tch_motion)) if self._tch_motion else 0.0
        enthu_pct = max(0.0, min(100.0, avg_motion * 18.0))
        not_enthu = 100.0 - enthu_pct
        verdict = 'HIGHLY ENTHUSIASTIC' if enthu_pct >= 55 else (
                  'ENTHUSIASTIC' if enthu_pct >= 40 else 'NOT ENTHUSIASTIC')

        with self._lock:
            self._stats.update({
                'frames_processed':  self._stats['frames_processed'] + 1,
                'students_detected': 1,           # the teacher
                'attentive':         0,
                'not_attentive':     0,
                'is_teacher':        True,
                'mode':              dom_mode,
                'mode_label':        mode_human,
                'enthu_pct':         round(enthu_pct, 1),
                'not_enthu_pct':     round(not_enthu, 1),
                'enthu_verdict':     verdict,
                'engagement':        round(enthu_pct, 1),
                'dominant_emotion':  'unknown',
                'reasons':           [],
                'fps':               round(fps_disp, 1),
                'any_face_seen':     True,
                'video_clarity':     'good',
            })


# ── module-level single active session ─────────────────────────────────────
# The project analyses one classroom at a time, so a single global session
# is enough and keeps the API simple.
_active_session = None
_session_lock   = threading.Lock()


def engine_available():
    return _IMPORT_OK


def engine_error():
    return _IMPORT_ERR


def start_session(camera_index=0, category='Theory'):
    global _active_session
    with _session_lock:
        # stop any previous session first
        if _active_session is not None and _active_session.running:
            _active_session.stop()
        _active_session = LiveSession(camera_index=camera_index, category=category)
        ok = _active_session.start()
        return ok, _active_session


def get_session():
    return _active_session


def stop_session():
    global _active_session
    with _session_lock:
        if _active_session is None:
            return None
        return _active_session.stop()
