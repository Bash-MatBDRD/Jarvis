"""
JARVIS — Serveur Flask principal
"""

import threading
from flask import Flask, render_template, jsonify
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


# ── WebSocket ────────────────────────────────────────────────────────────────

@socketio.on('connect')
def on_connect():
    info = system.get_system_info()
    emit('system_update', info)
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
