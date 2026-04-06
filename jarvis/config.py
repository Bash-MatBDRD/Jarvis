import os

CONFIG = {
    # ══════════════════════════════════════════════════════════════════════════
    #  IA — Groq (gratuit)
    #  → Créez un compte sur https://console.groq.com
    #  → Allez dans "API Keys" > "Create API Key"
    #  → Définissez la variable d'environnement GROQ_API_KEY (commence par gsk_)
    # ══════════════════════════════════════════════════════════════════════════
    'ai_provider': 'groq',
    'groq_api_key': os.environ.get('GROQ_API_KEY', ''),
    'groq_model':   'llama-3.3-70b-versatile',

    # ══════════════════════════════════════════════════════════════════════════
    #  Serveur local
    # ══════════════════════════════════════════════════════════════════════════
    'host': '0.0.0.0',
    'port': int(os.environ.get('PORT', 5000)),

    # ══════════════════════════════════════════════════════════════════════════
    #  Applications Windows
    # ══════════════════════════════════════════════════════════════════════════
    'steam_path': r'C:\Program Files (x86)\Steam\Steam.exe',
    'obs_path':   r'C:\Program Files\obs-studio\bin\64bit\obs64.exe',

    'obs_host':     'localhost',
    'obs_port':     4455,
    'obs_password': os.environ.get('OBS_PASSWORD', ''),

    'language': 'fr-FR',
}
