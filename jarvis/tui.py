"""
J.A.R.V.I.S — Interface Terminal (TUI)
"""

import sys
import os
import asyncio
import threading
from datetime import datetime

from textual.app import App, ComposeResult
from textual.widgets import (
    Header, Footer, Input, RichLog, Static, Label
)
from textual.containers import Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive
from textual import work
from textual.timer import Timer

from rich.text import Text
from rich.panel import Panel
from rich.table import Table
from rich.columns import Columns
from rich.progress import BarColumn, Progress, TextColumn
from rich import box

from config import CONFIG
from modules.ai import JarvisAI
from modules.system import SystemController

BANNER = r"""
     ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗
     ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝
     ██║███████║██████╔╝██║   ██║██║███████╗
██   ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║
╚█████╔╝██║  ██║██║  ██║ ╚████╔╝ ██║███████║
 ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝
"""

CSS = """
Screen {
    background: #0a0e1a;
    layers: base overlay;
}

#header-box {
    height: 10;
    background: #050810;
    border: tall #00d4ff;
    padding: 0 2;
    align: center middle;
    margin-bottom: 1;
}

#banner-text {
    color: #00d4ff;
    text-style: bold;
}

#tagline {
    color: #0077aa;
    text-style: italic;
}

#main-layout {
    height: 1fr;
    margin-bottom: 1;
}

#left-col {
    width: 40;
    margin-right: 1;
}

#stats-panel {
    height: 1fr;
    background: #070c18;
    border: tall #1a4466;
    padding: 1;
}

#right-col {
    width: 1fr;
}

#conv-panel {
    height: 1fr;
    background: #070c18;
    border: tall #1a4466;
}

#conv-log {
    height: 1fr;
    padding: 0 1;
}

#input-row {
    height: 3;
    background: #050810;
    border: tall #00d4ff;
    padding: 0 1;
    margin-top: 1;
}

#cmd-input {
    background: transparent;
    border: none;
    color: #00ffcc;
    width: 1fr;
}

#cmd-input:focus {
    border: none;
    background: transparent;
}

#status-bar {
    height: 1;
    background: #050810;
    color: #00d4ff;
    padding: 0 1;
}
"""


class StatsPanel(Static):
    """Panel affichant les stats système en temps réel."""

    def __init__(self, system: SystemController, **kwargs):
        super().__init__(**kwargs)
        self.system = system

    def on_mount(self):
        self.update_stats()
        self.set_interval(2, self.update_stats)

    def update_stats(self):
        try:
            info = self.system.get_system_info()
            detailed = self.system.get_detailed_info()
            self.render_stats(info, detailed)
        except Exception:
            pass

    def render_stats(self, info: dict, detailed: dict):
        now = datetime.now()
        time_str = now.strftime("%H:%M:%S")
        date_str = now.strftime("%d/%m/%Y")

        lines = []

        lines.append(Text("◆ SYSTÈME EN LIGNE", style="bold #00d4ff"))
        lines.append(Text(""))

        lines.append(Text(f"  🕐  {time_str}   📅  {date_str}", style="#aaaaff"))
        lines.append(Text(""))

        cpu_total = detailed['cpu']['total']
        cpu_bar = self._bar(cpu_total, 100, 20)
        lines.append(Text("  ⚙  CPU", style="bold #00d4ff"))
        lines.append(Text(f"  {cpu_bar} {cpu_total:.0f}%", style=self._heat(cpu_total)))

        ram_pct = detailed['ram']['percent']
        ram_bar = self._bar(ram_pct, 100, 20)
        lines.append(Text(""))
        lines.append(Text("  💾  RAM", style="bold #00d4ff"))
        lines.append(Text(f"  {ram_bar} {ram_pct:.0f}%", style=self._heat(ram_pct)))
        lines.append(Text(
            f"  {detailed['ram']['used_gb']:.1f} Go / {detailed['ram']['total_gb']:.1f} Go",
            style="#5566aa"
        ))

        lines.append(Text(""))
        lines.append(Text("  🌐  RÉSEAU", style="bold #00d4ff"))
        lines.append(Text(f"  ↑ {detailed['network']['sent_mb']:.0f} Mo envoyés", style="#00ccaa"))
        lines.append(Text(f"  ↓ {detailed['network']['recv_mb']:.0f} Mo reçus", style="#0099ff"))

        disks = detailed.get('disks', [])
        if disks:
            lines.append(Text(""))
            lines.append(Text("  🗄  DISQUES", style="bold #00d4ff"))
            for d in disks[:2]:
                disk_bar = self._bar(d['percent'], 100, 18)
                lines.append(Text(
                    f"  {d['mountpoint']}  {disk_bar} {d['percent']:.0f}%",
                    style=self._heat(d['percent'])
                ))

        battery = detailed.get('battery')
        if battery:
            lines.append(Text(""))
            plug = "⚡" if battery['plugged'] else "🔋"
            lines.append(Text(f"  {plug}  {battery['percent']}%", style="#00d4ff"))

        lines.append(Text(""))
        lines.append(Text("  ─────────────────────────", style="#1a3355"))
        lines.append(Text("  📋  TOP PROCESSUS", style="bold #00d4ff"))
        procs = detailed.get('processes', [])[:5]
        for p in procs:
            cpu_col = "#ff4444" if p['cpu'] > 30 else "#00ccaa"
            lines.append(Text(
                f"  {p['name'][:18]:<18} {p['cpu']:>5.1f}%",
                style=cpu_col
            ))

        result = Text()
        for i, line in enumerate(lines):
            result.append_text(line)
            if i < len(lines) - 1:
                result.append("\n")

        self.update(result)

    def _bar(self, value: float, max_val: float, width: int) -> str:
        filled = int((value / max_val) * width)
        filled = max(0, min(width, filled))
        chars = "▓" * filled + "░" * (width - filled)
        return chars

    def _heat(self, pct: float) -> str:
        if pct < 50:
            return "#00cc88"
        elif pct < 75:
            return "#ffaa00"
        else:
            return "#ff4444"


class JarvisApp(App):
    """Application principale J.A.R.V.I.S."""

    CSS = CSS
    TITLE = "J.A.R.V.I.S — MARK VII"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.system = SystemController()
        self.ai = JarvisAI(CONFIG)
        self._processing = False

    def compose(self) -> ComposeResult:
        mode = self.ai._mode.upper()
        provider = self.ai._provider.upper() if self.ai._provider != 'none' else 'BASIQUE'

        with Vertical(id="header-box"):
            yield Static(BANNER, id="banner-text")
            yield Static(
                f"MARK VII  ·  MODE {mode}  ·  {provider}  ·  SYSTÈMES EN LIGNE",
                id="tagline"
            )

        with Horizontal(id="main-layout"):
            with Vertical(id="left-col"):
                yield StatsPanel(self.system, id="stats-panel")
            with Vertical(id="right-col"):
                yield RichLog(id="conv-log", highlight=True, markup=True, wrap=True)

        with Horizontal(id="input-row"):
            yield Static("[bold #00d4ff]▶[/]  ", classes="prompt-arrow")
            yield Input(
                placeholder="Parlez à JARVIS…",
                id="cmd-input"
            )

    def on_mount(self):
        log = self.query_one("#conv-log", RichLog)
        log.write(Text("  J.A.R.V.I.S. initialisé. Systèmes nominaux.", style="bold #00d4ff"))
        log.write(Text("  Tapez votre commande ou question ci-dessous.", style="#446688"))
        log.write(Text("  ─" * 38, style="#1a3355"))

        self.query_one("#cmd-input", Input).focus()

    def on_input_submitted(self, event: Input.Submitted):
        text = event.value.strip()
        if not text:
            return
        event.input.value = ""
        if text.lower() in ("/quit", "/exit", "exit", "quit"):
            self.exit()
            return
        self._handle_message(text)

    def _handle_message(self, text: str):
        log = self.query_one("#conv-log", RichLog)

        now = datetime.now().strftime("%H:%M")
        log.write(Text(""))
        log.write(Text(f"  [{now}] VOUS", style="bold #ffaa00"))
        log.write(Text(f"  {text}", style="#eeeeee"))

        if self._processing:
            return
        self._processing = True

        inp = self.query_one("#cmd-input", Input)
        inp.placeholder = "Traitement en cours…"

        def _run():
            response = self.ai.process(text, self.system)
            self.call_from_thread(self._show_response, response)

        threading.Thread(target=_run, daemon=True).start()

    def _show_response(self, response: str):
        log = self.query_one("#conv-log", RichLog)
        now = datetime.now().strftime("%H:%M")
        log.write(Text(""))
        log.write(Text(f"  [{now}] J.A.R.V.I.S.", style="bold #00d4ff"))

        for line in response.split("\n"):
            log.write(Text(f"  {line}", style="#00ffcc"))

        log.write(Text("  ─" * 38, style="#1a3355"))

        self._processing = False
        inp = self.query_one("#cmd-input", Input)
        inp.placeholder = "Parlez à JARVIS…"
        inp.focus()


if __name__ == "__main__":
    app = JarvisApp()
    app.run()
