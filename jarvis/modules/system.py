"""
Contrôleur système — accès complet au PC
"""

import os
import sys
import glob
import time
import subprocess
import webbrowser
import platform
import shutil
from datetime import datetime

import psutil
import requests


class SystemController:
    """Exécute toutes les actions sur le PC."""

    # ── Ouvrir une application ────────────────────────────────────────────────

    def open_app(self, name: str) -> str:
        name_lower = name.lower().strip()

        # Aliases connus
        aliases = {
            'navigateur': 'chrome', 'browser': 'chrome',
            'musique': 'spotify', 'music': 'spotify',
            'fichiers': 'explorer', 'explorateur': 'explorer',
            'calculatrice': 'calc', 'calculator': 'calc',
            'bloc-notes': 'notepad', 'notepad': 'notepad',
            'discord': 'discord', 'vs code': 'code', 'vscode': 'code',
            'word': 'winword', 'excel': 'excel', 'powerpoint': 'powerpnt',
            'steam': 'steam', 'obs': 'obs64', 'spotify': 'spotify',
            'chrome': 'chrome', 'firefox': 'firefox', 'edge': 'msedge',
            'paint': 'mspaint', 'terminal': 'cmd', 'powershell': 'powershell',
        }
        resolved = aliases.get(name_lower, name_lower)

        # 1. Essai direct (apps dans PATH)
        if shutil.which(resolved):
            subprocess.Popen([resolved], shell=False)
            return f"{name} lancé avec succès."

        # 2. Essai via la commande Windows 'start'
        try:
            subprocess.Popen(f'start "" "{resolved}"', shell=True)
            return f"{name} lancé via le menu Démarrer."
        except Exception:
            pass

        # 3. Recherche dans Program Files
        search_dirs = [
            r'C:\Program Files',
            r'C:\Program Files (x86)',
            os.path.expandvars(r'%LOCALAPPDATA%'),
            os.path.expandvars(r'%APPDATA%'),
        ]
        for base in search_dirs:
            matches = glob.glob(
                os.path.join(base, '**', f'*{resolved}*.exe'),
                recursive=True
            )
            if matches:
                subprocess.Popen([matches[0]])
                return f"{name} trouvé et lancé depuis {matches[0]}"

        return f"Je n'ai pas trouvé '{name}' sur votre système. Vérifiez que l'application est installée."

    # ── Ouvrir un site web ────────────────────────────────────────────────────

    def open_website(self, url: str) -> str:
        if not url.startswith('http'):
            url = 'https://' + url
        webbrowser.open(url)
        return f"Ouverture de {url} dans votre navigateur."

    # ── Recherche web ─────────────────────────────────────────────────────────

    def search_web(self, query: str) -> str:
        url = f'https://www.google.com/search?q={requests.utils.quote(query)}'
        webbrowser.open(url)
        return f"Recherche Google lancée pour : {query}"

    # ── Informations système ──────────────────────────────────────────────────

    def get_system_info(self) -> dict:
        cpu    = psutil.cpu_percent(interval=0.5)
        ram    = psutil.virtual_memory()
        disk   = psutil.disk_usage('/')
        battery = psutil.sensors_battery()
        now    = datetime.now()

        info = {
            'cpu':    f"{cpu:.0f}%",
            'ram':    f"{ram.used / 1e9:.1f} Go / {ram.total / 1e9:.1f} Go ({ram.percent:.0f}%)",
            'disk':   f"{disk.used / 1e9:.0f} Go / {disk.total / 1e9:.0f} Go ({disk.percent:.0f}%)",
            'time':   now.strftime('%H:%M'),
            'date':   now.strftime('%A %d %B %Y'),
            'os':     f"{platform.system()} {platform.release()}",
        }
        if battery:
            status = "en charge" if battery.power_plugged else "sur batterie"
            info['battery'] = f"{battery.percent:.0f}% ({status})"
        else:
            info['battery'] = "Secteur"

        # Texte lisible pour JARVIS
        info['summary'] = (
            f"CPU à {info['cpu']}, RAM {info['ram']}, "
            f"disque {info['disk']}, batterie {info['battery']}."
        )
        return info

    # ── Météo ─────────────────────────────────────────────────────────────────

    def get_weather(self, city: str) -> str:
        try:
            r = requests.get(
                f'https://wttr.in/{requests.utils.quote(city)}?format=j1',
                timeout=5
            )
            data = r.json()
            current = data['current_condition'][0]
            desc    = current['weatherDesc'][0]['value']
            temp    = current['temp_C']
            feels   = current['FeelsLikeC']
            wind    = current['windspeedKmph']
            humid   = current['humidity']
            return (
                f"À {city} : {desc}, {temp}°C (ressenti {feels}°C), "
                f"vent {wind} km/h, humidité {humid}%."
            )
        except Exception:
            return f"Impossible de récupérer la météo pour {city} en ce moment."

    # ── Capture d'écran ───────────────────────────────────────────────────────

    def take_screenshot(self) -> str:
        try:
            from PIL import ImageGrab
            ts   = datetime.now().strftime('%Y%m%d_%H%M%S')
            path = os.path.join(os.path.expanduser('~'), 'Desktop', f'jarvis_{ts}.png')
            img  = ImageGrab.grab()
            img.save(path)
            os.startfile(path)
            return f"Capture d'écran enregistrée sur le Bureau : jarvis_{ts}.png"
        except Exception as e:
            return f"Capture d'écran impossible : {e}"

    # ── Nouveautés Steam ──────────────────────────────────────────────────────

    def get_steam_news(self) -> str:
        try:
            r = requests.get(
                'https://store.steampowered.com/api/featuredcategories/?l=french',
                timeout=6
            )
            items = r.json().get('new_releases', {}).get('items', [])
            if not items:
                return "Aucune nouveauté Steam disponible pour le moment."
            names = [i['name'] for i in items[:5]]
            return "Dernières sorties Steam : " + ", ".join(names) + "."
        except Exception:
            return "Impossible de contacter l'API Steam."

    # ── OBS / Stream ──────────────────────────────────────────────────────────

    def start_stream(self, obs_path: str, obs_cfg: dict) -> str:
        try:
            subprocess.Popen([obs_path])
            time.sleep(5)
            try:
                import obsws_python as obs
                client = obs.ReqClient(
                    host=obs_cfg['host'],
                    port=obs_cfg['port'],
                    password=obs_cfg['password'],
                    timeout=3,
                )
                time.sleep(2)
                client.start_stream()
                return "OBS lancé et stream démarré sur Twitch."
            except Exception:
                return "OBS lancé. Démarrez le stream manuellement ou configurez le WebSocket OBS."
        except FileNotFoundError:
            return "OBS Studio introuvable. Vérifiez le chemin dans config.py."

    # ── Ouvrir un fichier ou dossier ──────────────────────────────────────────

    def open_path(self, path: str) -> str:
        expanded = os.path.expandvars(os.path.expanduser(path))
        if os.path.exists(expanded):
            os.startfile(expanded)
            return f"Ouverture de : {expanded}"
        return f"Chemin introuvable : {path}"

    # ── Recherche de fichiers ─────────────────────────────────────────────────

    def search_files(self, query: str) -> str:
        home    = os.path.expanduser('~')
        results = []
        for root, dirs, files in os.walk(home):
            # Exclure les dossiers système cachés
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in
                       ('AppData', 'node_modules', '__pycache__', '$RECYCLE.BIN')]
            for f in files:
                if query.lower() in f.lower():
                    results.append(os.path.join(root, f))
                if len(results) >= 5:
                    break
            if len(results) >= 5:
                break

        if not results:
            return f"Aucun fichier trouvé pour '{query}'."
        lines = "\n".join(results)
        return f"Fichiers trouvés :\n{lines}"

    # ── Volume système ────────────────────────────────────────────────────────

    def set_volume(self, level: int) -> str:
        level = max(0, min(100, level))
        try:
            # PowerShell via NIRCMD ou script
            script = (
                f"$vol = New-Object -ComObject WScript.Shell; "
                f"for ($i=0; $i -lt 50; $i++) {{$vol.SendKeys([char]174)}}; "
                f"$steps = [math]::Round({level}/2); "
                f"for ($i=0; $i -lt $steps; $i++) {{$vol.SendKeys([char]175)}}"
            )
            subprocess.run(['powershell', '-c', script],
                           capture_output=True, timeout=3)
            return f"Volume réglé à environ {level}%."
        except Exception:
            return "Impossible de modifier le volume automatiquement."
