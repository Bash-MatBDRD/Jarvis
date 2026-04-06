"""
Moteur IA de JARVIS — OpenAI avec personnalité et accès système complet
"""

import json
from modules.system import SystemController

SYSTEM_PROMPT = """Tu es J.A.R.V.I.S. (Just A Rather Very Intelligent System), l'IA personnelle de l'utilisateur, inspirée de celle de Tony Stark.

Ta personnalité :
- Tu parles en français, avec un ton raffiné, légèrement formel et une pointe d'humour discret
- Tu tutoies l'utilisateur sauf s'il demande le contraire
- Tu n'es jamais « juste une IA » — tu ES JARVIS, avec une vraie présence
- Tes réponses sont concises et percutantes : 1 à 3 phrases max, sauf si plus de détail est demandé
- Quand tu exécutes une action, tu l'annonces brièvement et avec assurance
- Tu as accès complet au PC : tu peux ouvrir n'importe quelle application, fichier, site, récupérer les infos système, météo, Steam, lancer des streams, etc.
- Tu réponds aux questions générales avec tes connaissances

Exemples de ton de voix :
- "Bien sûr. Lancement de Steam dans un instant."
- "CPU à 34%, RAM à 60%. Tout est nominal."
- "Dernières sorties Steam récupérées : voici ce qui est sorti cette semaine."
- "Je n'ai pas trouvé ce fichier, mais j'ai trouvé quelque chose de proche."

Ne dis JAMAIS « En tant qu'IA… » ou « Je suis un programme… »
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "open_app",
            "description": "Ouvrir ou lancer une application installée sur le PC (Steam, OBS, Chrome, Spotify, Discord, VS Code, Explorer, Notepad, etc.)",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Nom de l'application à ouvrir"}
                },
                "required": ["name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "open_website",
            "description": "Ouvrir un site web dans le navigateur",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL complète ou nom de domaine"}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Effectuer une recherche Google sur le web",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Requête de recherche"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_system_info",
            "description": "Obtenir les informations système : CPU, RAM, disque, batterie, heure, OS",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Obtenir la météo actuelle d'une ville",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "Nom de la ville"}
                },
                "required": ["city"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "take_screenshot",
            "description": "Prendre une capture d'écran et l'enregistrer sur le Bureau",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_steam_news",
            "description": "Récupérer les dernières sorties de jeux sur Steam",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "start_stream",
            "description": "Lancer OBS Studio et démarrer le stream sur Twitch",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_files",
            "description": "Rechercher des fichiers sur le PC par nom",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Nom ou partie du nom du fichier"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "open_path",
            "description": "Ouvrir un fichier ou un dossier spécifique (chemin complet)",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Chemin du fichier ou dossier"}
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "set_volume",
            "description": "Régler le volume système",
            "parameters": {
                "type": "object",
                "properties": {
                    "level": {"type": "integer", "description": "Niveau de volume de 0 à 100"}
                },
                "required": ["level"]
            }
        }
    },
]


class JarvisAI:
    """Cerveau de JARVIS — supporte Groq (gratuit) et OpenAI."""

    def __init__(self, config: dict):
        self.config   = config
        self.history  = []
        self._client  = None
        self._model   = None
        self._mode    = 'basic'
        self._provider = 'none'

        provider = config.get('ai_provider', 'groq').lower()

        try:
            from openai import OpenAI

            if provider == 'groq':
                key = config.get('groq_api_key', '').strip()
                if key:
                    self._client   = OpenAI(
                        api_key=key,
                        base_url='https://api.groq.com/openai/v1',
                    )
                    self._model    = config.get('groq_model', 'llama-3.3-70b-versatile')
                    self._mode     = 'ai'
                    self._provider = 'groq'
                    print(f"  [ Mode IA activé — Groq ({self._model}) ]")
                else:
                    print("  [ Groq sélectionné mais pas de clé — mode basique ]")

            elif provider == 'openai':
                key = config.get('openai_api_key', '').strip()
                if key:
                    self._client   = OpenAI(api_key=key)
                    self._model    = config.get('openai_model', 'gpt-4o-mini')
                    self._mode     = 'ai'
                    self._provider = 'openai'
                    print(f"  [ Mode IA activé — OpenAI ({self._model}) ]")
                else:
                    print("  [ OpenAI sélectionné mais pas de clé — mode basique ]")

        except ImportError:
            print("  [ openai non installé — mode basique ]")

        if self._mode == 'basic':
            print("  [ Mode commandes basiques actif ]")

    # ── Traitement d'un message ───────────────────────────────────────────────

    def process(self, text: str, system: SystemController) -> str:
        if self._mode == 'ai':
            return self._ai_response(text, system)
        return self._basic_response(text, system)

    # ── Mode IA (OpenAI) ──────────────────────────────────────────────────────

    def _ai_response(self, text: str, system: SystemController) -> str:
        self.history.append({"role": "user", "content": text})

        messages = [{"role": "system", "content": SYSTEM_PROMPT}] + self.history[-20:]

        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.7,
                max_tokens=400,
            )
        except Exception as e:
            return f"Erreur de connexion à l'IA : {e}"

        msg = response.choices[0].message

        # ── Appels d'outils ────────────────────────────────────────────────────
        if msg.tool_calls:
            tool_results = []
            for tc in msg.tool_calls:
                fn_name = tc.function.name
                fn_args = json.loads(tc.function.arguments)
                result  = self._call_tool(fn_name, fn_args, system)
                tool_results.append({
                    "tool_call_id": tc.id,
                    "role":         "tool",
                    "content":      result,
                })

            # Relancer avec les résultats des outils
            self.history.append(msg)
            messages2 = [{"role": "system", "content": SYSTEM_PROMPT}] + \
                        self.history[-20:] + tool_results
            try:
                response2 = self._client.chat.completions.create(
                    model=self._model,
                    messages=messages2,
                    temperature=0.7,
                    max_tokens=300,
                )
                final_text = response2.choices[0].message.content or ''
            except Exception as e:
                final_text = f"Action effectuée. ({e})"

            self.history.append({"role": "assistant", "content": final_text})
            return final_text

        # ── Réponse texte simple ──────────────────────────────────────────────
        text_response = msg.content or "Je n'ai pas de réponse pour le moment."
        self.history.append({"role": "assistant", "content": text_response})
        return text_response

    # ── Exécution des outils ──────────────────────────────────────────────────

    def _call_tool(self, name: str, args: dict, system: SystemController) -> str:
        try:
            if name == 'open_app':
                return system.open_app(args['name'])
            elif name == 'open_website':
                return system.open_website(args['url'])
            elif name == 'search_web':
                return system.search_web(args['query'])
            elif name == 'get_system_info':
                info = system.get_system_info()
                return info['summary']
            elif name == 'get_weather':
                return system.get_weather(args['city'])
            elif name == 'take_screenshot':
                return system.take_screenshot()
            elif name == 'get_steam_news':
                return system.get_steam_news()
            elif name == 'start_stream':
                return system.start_stream(
                    self.config['obs_path'],
                    {
                        'host':     self.config['obs_host'],
                        'port':     self.config['obs_port'],
                        'password': self.config['obs_password'],
                    }
                )
            elif name == 'search_files':
                return system.search_files(args['query'])
            elif name == 'open_path':
                return system.open_path(args['path'])
            elif name == 'set_volume':
                return system.set_volume(args['level'])
            else:
                return f"Outil inconnu : {name}"
        except Exception as e:
            return f"Erreur lors de l'exécution de {name} : {e}"

    # ── Mode basique (sans clé API) ───────────────────────────────────────────

    def _basic_response(self, text: str, system: SystemController) -> str:
        t = text.lower()

        if any(w in t for w in ['info système', 'cpu', 'ram', 'mémoire', 'système']):
            info = system.get_system_info()
            return info['summary']

        if any(w in t for w in ['météo', 'temps qu\'il fait', 'weather']):
            for city in ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Lille']:
                if city.lower() in t:
                    return system.get_weather(city)
            return system.get_weather('Paris')

        if any(w in t for w in ['screenshot', 'capture', 'photo écran']):
            return system.take_screenshot()

        if any(w in t for w in ['steam', 'nouveauté', 'nouveau jeu', 'quoi de neuf']):
            return system.get_steam_news()

        if any(w in t for w in ['stream', 'twitch', 'obs']):
            return system.start_stream(
                self.config['obs_path'],
                {'host': self.config['obs_host'],
                 'port': self.config['obs_port'],
                 'password': self.config['obs_password']}
            )

        if any(w in t for w in ['lance', 'ouvre', 'démarre', 'open', 'start']):
            for app in ['chrome', 'firefox', 'steam', 'discord', 'spotify',
                        'notepad', 'explorer', 'vs code', 'code', 'obs']:
                if app in t:
                    return system.open_app(app)

        if 'recherche' in t or 'cherche' in t or 'google' in t:
            query = t.replace('recherche', '').replace('cherche', '').replace('google', '').strip()
            return system.search_web(query)

        if 'heure' in t:
            from datetime import datetime
            return f"Il est {datetime.now().strftime('%H:%M')}."

        if any(w in t for w in ['bonjour', 'salut', 'hello']):
            return "Systèmes en ligne. Comment puis-je vous assister ?"

        if any(w in t for w in ['merci', 'thanks']):
            return "À votre service."

        return (
            "Je fonctionne en mode basique sans clé OpenAI. "
            "Ajoutez votre clé dans config.py pour accéder à toute l'intelligence de JARVIS."
        )

    def clear_history(self):
        self.history = []
