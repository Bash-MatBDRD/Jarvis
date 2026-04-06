"""
JARVIS — Serveur Flask principal
"""

import threading
from flask import Flask, render_template, jsonify, request, Response
from flask_socketio import SocketIO, emit

from config import CONFIG
from modules.ai import JarvisAI
from modules.system import SystemController

app    = Flask(__name__)
app.config['SECRET_KEY'] = 'jarvis-2025'
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='threading')

ai     = JarvisAI(CONFIG)
system = SystemController()


# ── Routes HTTP ───────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html',
                           has_api_key=bool(CONFIG.get('openai_api_key', '').strip()))

@app.route('/status')
def status():
    return jsonify(system.get_system_info())

@app.route('/tts', methods=['POST'])
def tts():
    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()[:600]
    if not text:
        return '', 400
    key = CONFIG.get('openai_api_key', '').strip()
    if not key:
        return '', 503
    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)
        resp = client.audio.speech.create(model='tts-1', voice='onyx', input=text)
        return Response(resp.read(), mimetype='audio/mpeg')
    except Exception as e:
        return str(e), 500


# ── WebSocket ────────────────────────────────────────────────────────────────

@socketio.on('connect')
def on_connect():
    emit('system_update', system.get_system_info())
    emit('detailed_update', system.get_detailed_info())
    emit('jarvis_ready', {'mode': ai._mode, 'provider': ai._provider})


@socketio.on('user_message')
def on_message(data):
    text = (data.get('text') or '').strip()
    if not text:
        return

    emit('status_change', {'state': 'thinking'})

    def _process():
        response = ai.process(text, system)
        socketio.emit('jarvis_response', {'text': response})
        socketio.emit('status_change',   {'state': 'idle'})

    threading.Thread(target=_process, daemon=True).start()


@socketio.on('get_system_status')
def on_system_status():
    emit('system_update', system.get_system_info())

@socketio.on('get_detailed_status')
def on_detailed_status():
    emit('detailed_update', system.get_detailed_info())


@socketio.on('clear_history')
def on_clear():
    ai.clear_history()
    emit('jarvis_response', {'text': "Mémoire de conversation effacée."})


# ── Entrée principale ─────────────────────────────────────────────────────────

if __name__ == '__main__':
    host = CONFIG['host']
    port = CONFIG['port']
    print(f"\n  JARVIS — http://{host}:{port}\n")
    import webbrowser
    threading.Timer(1.2, lambda: webbrowser.open(f'http://{host}:{port}')).start()
    socketio.run(app, host=host, port=port, debug=False, use_reloader=False)
