"""
Flask API - Classroom AI Integration
Fixed: use os.listdir() instead of glob so paths with spaces work on Windows.
Fixed: paths are built using os.path.dirname(__file__) relative navigation.
Enhanced: returns structured JSON data for rich UI rendering.
"""

import os
import sys
import time
import glob
import random
import subprocess
import re
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

THIS_DIR     = os.path.dirname(os.path.abspath(__file__))
BASE_DIR     = os.path.abspath(os.path.join(THIS_DIR, '..', 'final_project'))
EMOTION_DIR  = os.path.join(BASE_DIR, 'emotions')
VIDEOS_DIR   = os.path.join(EMOTION_DIR, 'videos')
LAB_DIR      = os.path.join(BASE_DIR, 'lab')
LAB_DATASET  = os.path.join(LAB_DIR, 'lab dataset')
TEACHER_DIR  = os.path.join(BASE_DIR, 'teacher')

VIDEO_EXTS   = {'.mp4', '.avi', '.mov', '.mkv', '.MP4', '.AVI', '.MOV', '.MKV'}
PYTHON       = sys.executable

# ── REAL-TIME CAMERA CONFIGURATION ─────────────────────────────────────────
# Two ways the system can get a "real-time" video:
#
#   1. LIVE camera  — any USB UVC webcam (or a phone-as-webcam app such as
#      DroidCam / Iriun). OpenCV opens it as device index CAMERA_INDEX and
#      records CAMERA_RECORD_SECONDS of footage.
#
#   2. WATCH FOLDER — for standalone recorders (e.g. a button spy camera that
#      records onto a microSD card). You copy the recording into the folder
#      below; the system picks up the NEWEST file from it.
#
# When the real-time button is pressed the system tries (1) first, then (2),
# then finally falls back to the bundled sample videos so nothing ever breaks.
CAMERA_INDEX           = int(os.environ.get('CAMERA_INDEX', '1'))
CAMERA_RECORD_SECONDS  = int(os.environ.get('CAMERA_RECORD_SECONDS', '15'))
CAMERA_INPUT_DIR       = os.path.join(THIS_DIR, 'camera_input')   # drop SD-card recordings here
CAMERA_CAPTURE_DIR     = os.path.join(THIS_DIR, 'camera_captures')# live recordings saved here
# A recording in the watch folder is considered "fresh" if modified within
# this many minutes (so an old leftover file isn't mistaken for a new class).
CAMERA_FRESH_MINUTES   = int(os.environ.get('CAMERA_FRESH_MINUTES', '120'))

os.makedirs(CAMERA_INPUT_DIR, exist_ok=True)
os.makedirs(CAMERA_CAPTURE_DIR, exist_ok=True)

TEACHER_NAMES = [
    "Dr. Asha Menon",
    "Prof. Rajan Kumar",
    "Dr. Priya Nair",
    "Prof. Suresh Iyer",
    "Dr. Kavitha Reddy",
]

def list_videos(folder):
    if not os.path.isdir(folder):
        return []
    files = []
    for f in os.listdir(folder):
        ext = os.path.splitext(f)[1]
        if ext in VIDEO_EXTS:
            files.append(os.path.join(folder, f))
    return sorted(files)

def pick_one_video(folder, name_check=None):
    videos = list_videos(folder)
    if name_check:
        videos = [v for v in videos if name_check(os.path.basename(v).lower())]
    return random.choice(videos) if videos else None

def newest_video(folder, fresh_minutes=None):
    """Return the most-recently-modified video file in `folder`, or None.
    If `fresh_minutes` is given, the file must have been modified within that
    window (used so a stale leftover recording isn't reused for a new class).
    """
    vids = list_videos(folder)
    if not vids:
        return None
    vids.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    newest = vids[0]
    if fresh_minutes is not None:
        age_min = (time.time() - os.path.getmtime(newest)) / 60.0
        if age_min > fresh_minutes:
            return None
    return newest

def capture_from_live_camera(seconds=None):
    """Try to record `seconds` of video from a live UVC camera.
    Returns the saved file path, or None if no live camera is available.
    Safe to call even if OpenCV / a camera is absent — it just returns None.
    """
    seconds = seconds or CAMERA_RECORD_SECONDS
    try:
        import cv2
    except Exception:
        return None
    cap = None
    writer = None
    try:
        cap = cv2.VideoCapture(CAMERA_INDEX)
        if not cap or not cap.isOpened():
            return None
        # Read one frame to confirm the camera really delivers video
        ok, frame = cap.read()
        if not ok or frame is None:
            return None
        h, w = frame.shape[:2]
        fps = cap.get(cv2.CAP_PROP_FPS) or 0
        if fps <= 1 or fps > 60:
            fps = 20.0
        out_path = os.path.join(
            CAMERA_CAPTURE_DIR,
            f'live_{time.strftime("%Y%m%d_%H%M%S")}.mp4'
        )
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(out_path, fourcc, fps, (w, h))
        writer.write(frame)
        end_time = time.time() + seconds
        while time.time() < end_time:
            ok, frame = cap.read()
            if not ok or frame is None:
                break
            writer.write(frame)
        return out_path if os.path.exists(out_path) else None
    except Exception:
        return None
    finally:
        try:
            if writer is not None:
                writer.release()
        except Exception:
            pass
        try:
            if cap is not None:
                cap.release()
        except Exception:
            pass

def resolve_realtime_video(category_folder, name_check=None):
    """Decide which video to use for a real-time analysis request.

    Order of preference:
      1. Live camera capture (USB / phone webcam)
      2. Newest fresh recording dropped into camera_input/  (button spy cam)
      3. Bundled sample video for this category (so the demo never breaks)

    Returns a tuple: (video_path, source_label)
      source_label is one of: 'live-camera', 'camera-recording', 'sample'
    """
    # 1. live camera
    live = capture_from_live_camera()
    if live:
        return live, 'live-camera'
    # 2. recording dropped into the watch folder
    recording = newest_video(CAMERA_INPUT_DIR, fresh_minutes=CAMERA_FRESH_MINUTES)
    if recording:
        return recording, 'camera-recording'
    # 3. fall back to the bundled sample
    sample = pick_one_video(category_folder, name_check=name_check)
    return sample, 'sample'


# Tracks the currently-running analysis subprocess so it can be cancelled
# from the dashboard (when the user closes the analysis modal).
_CURRENT_ANALYSIS_PROC = None

def run_script(cmd, cwd):
    """Run an analysis script.

    The child's output is STREAMED LINE-BY-LINE to the terminal that Flask
    is running in (so you see VIDEO DETAILS, frame progress, the final
    report, etc. live in the console) AND captured so the dashboard can
    still parse a clean summary from it.
    """
    env = {
        **os.environ,
        'PYTHONIOENCODING': 'utf-8',
        'PYTHONUTF8': '1',
        'PYTHONUNBUFFERED': '1',
    }
    captured = []
    banner = f'[ANALYSIS] running: {" ".join(str(c) for c in cmd)}'
    print('\n' + '=' * 70, flush=True)
    print(banner, flush=True)
    print(f'[ANALYSIS] working dir: {cwd}', flush=True)
    print('=' * 70, flush=True)
    try:
        proc = subprocess.Popen(
            cmd, cwd=cwd,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding='utf-8', errors='replace',
            bufsize=1, env=env,
        )
        global _CURRENT_ANALYSIS_PROC
        _CURRENT_ANALYSIS_PROC = proc
        start = time.time()
        for line in iter(proc.stdout.readline, ''):
            # echo to Flask's own terminal in real time …
            sys.stdout.write(line)
            sys.stdout.flush()
            # … and keep it for the dashboard summary parser
            captured.append(line.rstrip('\n'))
            if time.time() - start > 600:
                proc.kill()
                print('[ANALYSIS] TIMEOUT — killed after 600s', flush=True)
                return '__TIMEOUT__'
        proc.stdout.close()
        proc.wait(timeout=30)
        print('[ANALYSIS] done.\n', flush=True)
        return '\n'.join(captured).strip()
    except subprocess.TimeoutExpired:
        return '__TIMEOUT__'
    except Exception as exc:
        print(f'[ANALYSIS] ERROR: {exc}', flush=True)
        return f'__ERROR__ {exc}'
    finally:
        _CURRENT_ANALYSIS_PROC = None

_NOISE = re.compile(
    r'^\s*$'
    r'|\[INFO\]'
    r'|\[OK\]'
    r'|\[WARN'
    r'|\[ERROR\].*[Cc]annot open'
    r'|\[FRAME\s*\d+'
    r'|Press\s+Q|press\s+Q|Q=quit|Q/ESC'
    r'|^\s*\.\.\.'
    r'|frames?\s*\('
    r'|Output (Video|Log)\s*:'
    r'|annotated video\s*:'
    r'|JSON report saved'
    r'|Output folder\s*:'
    r'|Saved:|Paused\.|Resumed\.'
    r'|Video finished\.'
    r'|Loading YOLOv8|YOLOv8n loaded|YOLO load'
    r'|ultralytics|MediaPipe'
    r'|Using device:|Device\s*:'
    r'|enthusiasm model|enthusiasm predictor|Enthusiasm model'
    r'|Teaching classes|Teaching model\s*:'
    r'|Selected video\s*:|Selected video'
    r'|Resolution:|Video\s*:\s*\d+x\d+'
    r'|VIDEO DETAILS|Frame count\s*:|Duration\s*:|FPS\s*:'
    r'|\[ANNOTATED\]'
    r'|Starting analysis|Picking randomly'
    r'|Available videos|Randomly selected'
    r'|Lab dataset folder'
    r'|^\s*[.]{3,}\s*\d+/\d+'
    r'|frame_skip'
    r'|Train the model first'
    r'|User quit early'
    r'|Output video saved'
    r'|Starting inference'
    r'|Using specified video'
    r'|Random video selected'
    r'|Classroom Monitor'
    r'|Teacher Analyzer.*Combined'
    , re.IGNORECASE
)

_SUMMARY_MARKER = {
    'lab':     re.compile(r'FINAL ANALYSIS REPORT', re.IGNORECASE),
    'emotion': re.compile(r'FINAL ANALYSIS REPORT', re.IGNORECASE),
    'teacher': re.compile(r'MODE VERDICT|ENTHU VERDICT|OVERALL TEACHER|MODE ANALYSIS|ENTHUSIASM ANALYSIS', re.IGNORECASE),
}

_FILE_PATH_NOISE = re.compile(
    r'Output (Video|Log)\s*:|annotated video|JSON report|Output folder',
    re.IGNORECASE
)

def filter_summary(raw: str, mode: str) -> str:
    if raw.startswith('__TIMEOUT__'):
        return 'Analysis timed out after 10 minutes.'
    if raw.startswith('__ERROR__'):
        return f'Could not start the analysis script.\n{raw[9:]}'
    if not raw:
        return '(No output captured)'

    lines = raw.splitlines()
    marker = _SUMMARY_MARKER.get(mode, _SUMMARY_MARKER['lab'])
    start_idx = None
    for i, line in enumerate(lines):
        if marker.search(line):
            start_idx = max(0, i - 3)
            break

    if start_idx is None:
        cleaned = [ln for ln in lines if not _NOISE.search(ln)]
        result = '\n'.join(cleaned).strip()
        return result or '(Script ran but produced no summary)'

    kept = []
    for line in lines[start_idx:]:
        if _FILE_PATH_NOISE.search(line):
            continue
        kept.append(line)

    return '\n'.join(kept).strip() or '(Summary section was empty)'


# ── Structured parsers ─────────────────────────────────────────────────────────

def parse_emotion_data(text: str) -> dict:
    data = {
        'attentive_pct': 0.0, 'not_attentive_pct': 0.0,
        'total': 0, 'attentive': 0, 'not_attentive': 0,
        'verdict': '', 'reasons': [], 'error': False,
    }
    if not text or text.startswith('(') or 'timed out' in text.lower() or 'Could not' in text:
        data['error'] = True; data['error_msg'] = text; return data

    # All count lines are LINE-ANCHORED so "Attentive : N" never picks up
    # the "Not Attentive : N" line by accident.
    m = re.search(r'(?m)^\s*Total Students\s*:\s*(\d+)', text)
    if m: data['total'] = int(m.group(1))

    m = re.search(r'(?m)^\s*Attentive\s*:\s*(\d+)\s*$', text)
    if m: data['attentive'] = int(m.group(1))

    m = re.search(r'(?m)^\s*Not Attentive\s*:\s*(\d+)\s*$', text)
    if m: data['not_attentive'] = int(m.group(1))

    # Percentage bar lines, also line-anchored.
    pa  = re.search(r'(?m)^\s*Attentive\s+\[.*?\]\s+([\d.]+)\s*%', text)
    pna = re.search(r'(?m)^\s*Not Attentive\s+\[.*?\]\s+([\d.]+)\s*%', text)

    if pa:
        data['attentive_pct'] = float(pa.group(1))
        data['not_attentive_pct'] = round(100.0 - data['attentive_pct'], 1)
    elif pna:
        data['not_attentive_pct'] = float(pna.group(1))
        data['attentive_pct'] = round(100.0 - data['not_attentive_pct'], 1)
    elif data['total'] > 0:
        # Fall back to the raw counts (Attentive / Total).
        data['attentive_pct'] = round(data['attentive'] / data['total'] * 100, 1)
        data['not_attentive_pct'] = round(100.0 - data['attentive_pct'], 1)
    elif (data['attentive'] + data['not_attentive']) > 0:
        tot = data['attentive'] + data['not_attentive']
        data['attentive_pct'] = round(data['attentive'] / tot * 100, 1)
        data['not_attentive_pct'] = round(100.0 - data['attentive_pct'], 1)

    reasons = re.findall(r'[•\*]\s+(.+)', text)
    data['reasons'] = [r.strip() for r in reasons if r.strip() and r.strip() != 'None']

    if data['attentive_pct'] >= 60:
        data['verdict'] = 'ATTENTIVE'
    elif data['not_attentive_pct'] >= 60:
        data['verdict'] = 'NOT ATTENTIVE'
    else:
        data['verdict'] = 'MIXED'
    return data


def parse_lab_data(text: str) -> dict:
    data = {
        'focused_pct': 0.0, 'distracted_pct': 0.0,
        'verdict': '', 'insight': '', 'error': False,
    }
    if not text or text.startswith('(') or 'timed out' in text.lower() or 'Could not' in text:
        data['error'] = True; data['error_msg'] = text; return data

    m = re.search(r'Focused\s+\[.*?\]\s+([\d.]+)%', text)
    if m: data['focused_pct'] = float(m.group(1))

    m = re.search(r'Distracted\s+\[.*?\]\s+([\d.]+)%', text)
    if m: data['distracted_pct'] = float(m.group(1))

    if data['focused_pct'] > 0 and data['distracted_pct'] == 0:
        data['distracted_pct'] = round(100.0 - data['focused_pct'], 1)

    m = re.search(r'Insight\s*:\s*(.+)', text)
    if m: data['insight'] = re.sub(r'[✅⚠️⚖️]', '', m.group(1)).strip()

    if data['focused_pct'] >= 60:
        data['verdict'] = 'FOCUSED'
    elif data['distracted_pct'] >= 60:
        data['verdict'] = 'DISTRACTED'
    else:
        data['verdict'] = 'MIXED'
    return data


def parse_teacher_data(text: str) -> dict:
    data = {
        'mode': '', 'mode_label': '',
        'enthu_pct': 0.0, 'not_enthu_pct': 0.0,
        'enthu_verdict': '', 'overall_insight': '',
        'recommendation': '', 'error': False,
    }
    if not text or text.startswith('(') or 'timed out' in text.lower() or 'Could not' in text:
        data['error'] = True; data['error_msg'] = text; return data

    m = re.search(r'MODE VERDICT\s*:\s*(.+)', text)
    if m:
        raw_mode = m.group(1).strip()
        rl = raw_mode.upper()
        if 'BOARD' in rl and 'PPT' in rl:
            data['mode'] = 'boardandppt'; data['mode_label'] = 'Board + PPT'
        elif 'PPT' in rl or 'SCREEN' in rl:
            data['mode'] = 'pptonly'; data['mode_label'] = 'PPT / Screen Only'
        else:
            data['mode'] = 'boardonly'; data['mode_label'] = 'Board Only'

    m = re.search(r'(?m)^\s*Enthusiastic\s*:\s*\[.*?\]\s+([\d.]+)%', text)
    if m: data['enthu_pct'] = float(m.group(1))

    m = re.search(r'(?m)^\s*Not Enthusiastic\s*:\s*\[.*?\]\s+([\d.]+)%', text)
    if m: data['not_enthu_pct'] = float(m.group(1))

    if data['enthu_pct'] > 0 and data['not_enthu_pct'] == 0:
        data['not_enthu_pct'] = round(100.0 - data['enthu_pct'], 1)

    # Body-language / motion metrics printed by teacher_analyzer.py.
    m = re.search(r'Avg Engagement\s*:\s*([\d.]+)', text)
    if m: data['avg_engagement'] = float(m.group(1))
    m = re.search(r'Peak Engagement\s*:\s*([\d.]+)', text)
    if m: data['peak_engagement'] = float(m.group(1))
    m = re.search(r'Avg Body Motion\s*:\s*([\d.]+)', text)
    if m: data['avg_motion'] = float(m.group(1))

    m = re.search(r'ENTHU VERDICT\s*:\s*(.+)', text)
    if m: data['enthu_verdict'] = re.sub(r'[🔥⚠️]', '', m.group(1)).strip()

    m = re.search(r'This teacher primarily uses(.+?)(?:\n|$)', text)
    if m: data['overall_insight'] = ('This teacher primarily uses' + m.group(1)).strip()

    for pattern in [r'[✔✓]\s*(.+)', r'[✎✏]\s*(.+)']:
        m = re.search(pattern, text)
        if m: data['recommendation'] = m.group(1).strip(); break

    return data


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.route('/teachers', methods=['GET'])
def get_teachers():
    return jsonify({'teachers': TEACHER_NAMES})

def wants_camera():
    """True if the request asked for a real-time camera source.
    Frontend sends {"source": "camera"} in the JSON body, or ?source=camera.
    """
    body = request.get_json(silent=True) or {}
    src = (body.get('source') or request.args.get('source') or '').lower()
    return src == 'camera'

@app.route('/run/lab', methods=['GET', 'POST'])
def run_lab():
    if wants_camera():
        video, source = resolve_realtime_video(LAB_DATASET)
    else:
        video, source = pick_one_video(LAB_DATASET), 'sample'

    if not video:
        return jsonify({'output': f'No lab video available.\nChecked camera + folder:\n{LAB_DATASET}'}), 404

    raw = run_script(
        [PYTHON, 'test.py', '--video', video, '--lab_dataset', LAB_DATASET, '--no_display'],
        cwd=LAB_DIR,
    )
    summary_text = filter_summary(raw, 'lab')
    return jsonify({
        'output': summary_text,
        'video': os.path.basename(video),
        'source': source,
        'structured': parse_lab_data(summary_text),
        'type': 'lab',
    })

@app.route('/run/theory', methods=['GET', 'POST'])
def run_theory():
    if wants_camera():
        video, source = resolve_realtime_video(VIDEOS_DIR, name_check=lambda n: n.startswith('theory'))
    else:
        video, source = pick_one_video(VIDEOS_DIR, name_check=lambda n: n.startswith('theory')), 'sample'

    if not video:
        return jsonify({'output': f'No theory video available.\nChecked camera + folder:\n{VIDEOS_DIR}'}), 404

    raw = run_script([PYTHON, 'run_video.py', '--video', video], cwd=EMOTION_DIR)
    summary_text = filter_summary(raw, 'emotion')
    return jsonify({
        'output': summary_text,
        'video': os.path.basename(video),
        'source': source,
        'structured': parse_emotion_data(summary_text),
        'type': 'theory',
    })

@app.route('/run/tutorial', methods=['GET', 'POST'])
def run_tutorial():
    if wants_camera():
        video, source = resolve_realtime_video(VIDEOS_DIR, name_check=lambda n: not n.startswith('theory'))
    else:
        video, source = pick_one_video(VIDEOS_DIR, name_check=lambda n: not n.startswith('theory')), 'sample'

    if not video:
        return jsonify({'output': f'No tutorial video available.\nChecked camera + folder:\n{VIDEOS_DIR}'}), 404

    raw = run_script([PYTHON, 'run_video.py', '--video', video], cwd=EMOTION_DIR)
    summary_text = filter_summary(raw, 'emotion')
    return jsonify({
        'output': summary_text,
        'video': os.path.basename(video),
        'source': source,
        'structured': parse_emotion_data(summary_text),
        'type': 'tutorial',
    })

@app.route('/run/teacher', methods=['GET', 'POST'])
def run_teacher():
    body         = request.get_json(silent=True) or {}
    teacher_name = body.get('teacher', 'Unknown Teacher')
    subject_name = body.get('subject', '')
    print('\n' + '#' * 70, flush=True)
    print(f'# TEACHER ANALYSIS  ·  teacher="{teacher_name}"  subject="{subject_name}"', flush=True)
    print('#' * 70, flush=True)
    raw = run_script([PYTHON, 'teacher_analyzer.py', '--no_display'], cwd=TEACHER_DIR)
    summary_text = filter_summary(raw, 'teacher')
    structured   = parse_teacher_data(summary_text)
    # If the teacher pipeline produced nothing usable, say so explicitly so
    # the dashboard shows a clear message instead of an empty card.
    if (not structured.get('mode_label')
            and not structured.get('enthu_pct')
            and not structured.get('error')):
        structured['error']     = True
        structured['error_msg'] = (
            'The teacher analysis script ran but did not produce a mode / '
            'enthusiasm result. Check the Flask terminal — the most common '
            'cause is a missing Python package (torch / joblib / opencv) or '
            'no teacher video in the teacher folder.'
        )
    return jsonify({
        'output': summary_text,
        'teacher': teacher_name,
        'subject': subject_name,
        'structured': structured,
        'type': 'teacher',
    })

@app.route('/health', methods=['GET'])
def health():
    def dir_info(path):
        if os.path.isdir(path):
            return {'exists': True, 'files': os.listdir(path)[:10]}
        return {'exists': False}
    return jsonify({
        'status': 'ok',
        'paths': {
            'base':        {'path': BASE_DIR,    **dir_info(BASE_DIR)},
            'lab':         {'path': LAB_DIR,     **dir_info(LAB_DIR)},
            'lab_dataset': {'path': LAB_DATASET, **dir_info(LAB_DATASET)},
            'emotion':     {'path': EMOTION_DIR, **dir_info(EMOTION_DIR)},
            'videos':      {'path': VIDEOS_DIR,  **dir_info(VIDEOS_DIR)},
            'teacher':     {'path': TEACHER_DIR, **dir_info(TEACHER_DIR)},
        }
    })

# ── LIVE REAL-TIME SESSION ENDPOINTS ───────────────────────────────────────
# These power the Start / Stop buttons. Unlike /run/*, which analyse a whole
# video file, these run the analysis CONTINUOUSLY on the live camera feed in
# a background thread; the dashboard polls /live/stats every couple of seconds.
try:
    import live_engine
    _LIVE_OK = True
except Exception as _live_err:        # pragma: no cover
    _LIVE_OK = False
    _LIVE_IMPORT_ERR = str(_live_err)

@app.route('/analysis/cancel', methods=['POST'])
def analysis_cancel():
    """Kill any recorded-video analysis subprocess that is currently running.
    Called when the user closes the analysis modal (X / delete) so the
    analysis stops instead of running on in the background."""
    global _CURRENT_ANALYSIS_PROC
    proc = _CURRENT_ANALYSIS_PROC
    if proc is not None and proc.poll() is None:
        try:
            proc.kill()
            print('[ANALYSIS] cancelled by user (modal closed).', flush=True)
        except Exception as e:
            print(f'[ANALYSIS] cancel error: {e}', flush=True)
        return jsonify({'ok': True, 'message': 'Analysis cancelled'})
    return jsonify({'ok': True, 'message': 'No analysis running'})

@app.route('/live/start', methods=['POST'])
def live_start():
    """Begin a live real-time analysis session.
    Body (JSON): { "category": "Lab" | "Theory" | "Tutorial" }
    """
    if not _LIVE_OK:
        return jsonify({'ok': False,
                        'error': f'Live engine could not load: {_LIVE_IMPORT_ERR}'}), 500
    if not live_engine.engine_available():
        return jsonify({'ok': False,
                        'error': f'Live engine unavailable: {live_engine.engine_error()}'}), 500

    body     = request.get_json(silent=True) or {}
    category = body.get('category', 'Theory')
    ok, session = live_engine.start_session(camera_index=CAMERA_INDEX,
                                            category=category)
    if not ok:
        return jsonify({'ok': False,
                        'error': session.error or 'Could not start live session'}), 500
    return jsonify({'ok': True, 'message': 'Live analysis started',
                    'category': category})

@app.route('/live/stats', methods=['GET'])
def live_stats():
    """Return the current rolling stats of the active live session.
    The dashboard polls this every ~2 seconds while a session runs.
    """
    if not _LIVE_OK:
        return jsonify({'running': False, 'error': 'Live engine not loaded'}), 200
    session = live_engine.get_session()
    if session is None:
        return jsonify({'running': False, 'error': None,
                        'message': 'No live session'}), 200
    return jsonify(session.snapshot())

@app.route('/live/stop', methods=['POST'])
def live_stop():
    """Stop the active live session and return the final stats.

    HONEST MODE: the numbers reported here are exactly what the model
    measured from the live camera feed. Nothing is normalised, randomised
    or assumed. If the camera saw no students, or the feed was unclear,
    that is reported truthfully instead of inventing engagement values.
    """
    if not _LIVE_OK:
        return jsonify({'ok': False, 'error': 'Live engine not loaded'}), 200
    final = live_engine.stop_session()
    if final is None:
        return jsonify({'ok': True, 'message': 'No session was running',
                        'final': None})

    category = (final.get('category', 'Theory') or 'Theory')
    eng       = final.get('engagement', 0.0)
    attentive = final.get('attentive', 0)
    total     = final.get('students_detected', 0)
    dominant  = final.get('dominant_emotion', 'unknown')
    frames    = final.get('frames_processed', 0)
    faces_seen = final.get('any_face_seen', False)
    clarity    = final.get('video_clarity', 'unknown')
    clarity_note = final.get('quality_note', '')

    # ── TEACHER session: return the teacher-specific structured directly
    #    (mode + enthusiasm). Don't run the student "quality_ok" check
    #    against student fields like students_detected — they don't apply.
    if str(category).lower() == 'teacher':
        structured = {
            'analysable':       frames > 0,
            'is_teacher':       True,
            'mode':             final.get('mode', ''),
            'mode_label':       final.get('mode_label', 'Not detected'),
            'enthu_pct':        final.get('enthu_pct', 0),
            'not_enthu_pct':    final.get('not_enthu_pct', 0),
            'enthu_verdict':    final.get('enthu_verdict', 'NOT ENTHUSIASTIC'),
            'verdict':          final.get('enthu_verdict', ''),
            'frames_processed': frames,
            'elapsed_seconds':  final.get('elapsed_seconds', 0),
            'reasons':          final.get('reasons', []),
        }
        if frames == 0:
            structured['quality_issue'] = (
                'The teacher analysis did not run on any frame. '
                'Check that the camera is producing a feed and that the '
                'teaching-mode model loaded correctly (see the Flask console).'
            )
        return jsonify({'ok': True, 'message': 'Live analysis stopped',
                        'analysable': structured['analysable'],
                        'final': final, 'structured': structured,
                        'type': 'teacher'})

    # ── Honest quality check ───────────────────────────────────────────────
    # If the live session never detected a student / face, or the video was
    # too unclear, we do NOT invent an engagement number. We report the
    # situation truthfully so the user knows the result is not usable.
    quality_ok = (total > 0 and faces_seen and frames > 0 and clarity != 'low')

    if not quality_ok:
        if frames == 0:
            reason = 'No frames were captured from the camera.'
        elif clarity == 'low':
            reason = (clarity_note or
                      'Video clarity was too low for a reliable analysis. '
                      'The feed was blurry or out of focus.')
        elif total == 0:
            reason = ('No students were detected in the camera view. '
                      'The camera may not be pointed at the class, or the '
                      'students are too far / too small in the frame.')
        elif not faces_seen:
            reason = ('Students were detected but no clear faces could be '
                      'read. The video may be too blurry, too dark, or the '
                      'faces too small for the model to analyse.')
        else:
            reason = 'The live feed did not provide analysable video.'

        structured = {
            'analysable':       False,
            'quality_issue':    reason,
            'video_clarity':    clarity,
            'total_students':   total,
            'frames_processed': frames,
            'elapsed_seconds':  final.get('elapsed_seconds', 0),
        }
        return jsonify({'ok': True, 'message': 'Live analysis stopped',
                        'analysable': False,
                        'final': final, 'structured': structured,
                        'type': category.lower()})

    # ── Genuine result — exactly what the model measured ───────────────────
    structured = {
        'analysable':      True,
        'attentive_pct':   round(eng, 1),
        'focused_pct':     round(eng, 1),
        'distracted_pct':  round(max(0.0, 100.0 - eng), 1),
        'dominant_emotion': dominant,
        'total_students':  total,
        'attentive_count': attentive,
        'verdict': ('HIGHLY ENGAGED' if eng >= 75
                    else 'GOOD ENGAGEMENT' if eng >= 50
                    else 'LOW ENGAGEMENT'),
        'reasons': final.get('reasons', []),
        'elapsed_seconds': final.get('elapsed_seconds', 0),
        'frames_processed': frames,
    }
    return jsonify({'ok': True, 'message': 'Live analysis stopped',
                    'analysable': True,
                    'final': final, 'structured': structured,
                    'type': category.lower()})

# ── CAMERA HELPER ENDPOINTS ────────────────────────────────────────────────

@app.route('/camera/test', methods=['GET'])
def camera_test():
    """Probe camera indices 0-5 and report which ones open successfully.
    Use this to find the index of your phone (Iriun / DroidCam) camera.
      GET http://localhost:8000/camera/test
    """
    results = []
    try:
        import cv2
    except Exception:
        return jsonify({'opencv': False,
                        'message': 'OpenCV not installed. Run: pip install opencv-python'})

    # On Windows, DirectShow opens phone-webcam apps (Iriun/DroidCam) far
    # more reliably than the default backend.
    use_dshow = hasattr(cv2, 'CAP_DSHOW')
    for idx in range(6):
        cap = None
        try:
            cap = (cv2.VideoCapture(idx, cv2.CAP_DSHOW) if use_dshow
                   else cv2.VideoCapture(idx))
            opened = bool(cap and cap.isOpened())
            ok, frame = (cap.read() if opened else (False, None))
            results.append({
                'index': idx,
                'opened': opened,
                'delivers_frame': bool(ok and frame is not None),
                'resolution': (f'{frame.shape[1]}x{frame.shape[0]}'
                               if (ok and frame is not None) else None),
            })
        except Exception as e:
            results.append({'index': idx, 'opened': False, 'error': str(e)})
        finally:
            if cap is not None:
                try: cap.release()
                except Exception: pass
    working = [r['index'] for r in results if r.get('delivers_frame')]
    return jsonify({
        'opencv': True,
        'current_CAMERA_INDEX': CAMERA_INDEX,
        'working_indices': working,
        'detail': results,
        'hint': ('Live analysis auto-detects a working camera, so you '
                 'normally do not need to set anything. If you want to '
                 'force a specific one, set CAMERA_INDEX before starting '
                 'Flask, e.g. (Windows)  set CAMERA_INDEX=1 && python app.py'),
    })

@app.route('/camera/status', methods=['GET'])
def camera_status():
    """Report what a real-time request would use right now, without
    actually recording a full clip.
    """
    try:
        import cv2
        has_cv2 = True
    except Exception:
        has_cv2 = False

    live_ok = False
    if has_cv2:
        cap = None
        try:
            cap = cv2.VideoCapture(CAMERA_INDEX)
            if cap and cap.isOpened():
                ok, frame = cap.read()
                live_ok = bool(ok and frame is not None)
        except Exception:
            live_ok = False
        finally:
            if cap is not None:
                try: cap.release()
                except Exception: pass

    recording = newest_video(CAMERA_INPUT_DIR, fresh_minutes=CAMERA_FRESH_MINUTES)

    if live_ok:
        active = 'live-camera'
    elif recording:
        active = 'camera-recording'
    else:
        active = 'sample'

    return jsonify({
        'opencv_installed':   has_cv2,
        'live_camera_ready':  live_ok,
        'camera_index':       CAMERA_INDEX,
        'record_seconds':     CAMERA_RECORD_SECONDS,
        'watch_folder':       CAMERA_INPUT_DIR,
        'fresh_recording':    os.path.basename(recording) if recording else None,
        'source_that_would_be_used': active,
    })

if __name__ == '__main__':
    print('Flask API  ->  http://localhost:8000')
    print(f'  this file  : {os.path.abspath(__file__)}')
    print(f'  base_dir   : {BASE_DIR}  [exists={os.path.isdir(BASE_DIR)}]')
    print(f'  camera idx : {CAMERA_INDEX}   record secs: {CAMERA_RECORD_SECONDS}')
    print(f'  watch dir  : {CAMERA_INPUT_DIR}')
    print('  test camera: http://localhost:8000/camera/test')
    app.run(host='0.0.0.0', port=8000, debug=False)
