"""
JARVIS — Lanceur fenêtre native (pywebview)
Lance Flask en arrière-plan et ouvre une vraie fenêtre de bureau.
"""

import sys
import time
import threading

def main():
    try:
        import webview
    except ImportError:
        print("\n  [!] pywebview non installé. Lancez : pip install pywebview")
        print("  [!] Ouverture dans le navigateur à la place...\n")
        import webbrowser
        from app import app, socketio, CONFIG
        host, port = CONFIG['host'], CONFIG['port']
        threading.Timer(1.2, lambda: webbrowser.open(f'http://{host}:{port}')).start()
        socketio.run(app, host=host, port=port, debug=False, use_reloader=False)
        return

    from app import app, socketio, CONFIG
    host = CONFIG['host']
    port = CONFIG['port']
    url  = f'http://{host}:{port}'

    ready = threading.Event()

    def run_server():
        socketio.run(app, host=host, port=port, debug=False, use_reloader=False,
                     allow_unsafe_werkzeug=True)

    t = threading.Thread(target=run_server, daemon=True)
    t.start()

    # Attendre que Flask réponde
    import urllib.request
    for _ in range(20):
        try:
            urllib.request.urlopen(url, timeout=1)
            break
        except Exception:
            time.sleep(0.3)

    window = webview.create_window(
        title    = 'J.A.R.V.I.S — Intelligence Artificielle',
        url      = url,
        width    = 1440,
        height   = 900,
        resizable= True,
        min_size = (900, 600),
        background_color = '#02080f',
    )
    webview.start(debug=False)


if __name__ == '__main__':
    # Changer le répertoire de travail vers jarvis/
    import os
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    main()
