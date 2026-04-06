CONFIG = {
    # ══════════════════════════════════════════════════════════════════════════
    #  IA — Choisissez votre fournisseur
    # ══════════════════════════════════════════════════════════════════════════

    # Fournisseur actif : 'groq' (gratuit) | 'openai' (payant) | 'none' (basique)
    'ai_provider': 'groq',

    # ── Groq — GRATUIT ────────────────────────────────────────────────────────
    # 1. Créez un compte sur https://console.groq.com
    # 2. Allez dans "API Keys" > "Create API Key"
    # 3. Collez la clé ci-dessous (commence par gsk_...)
    'groq_api_key': '',  # Définir la variable d'environnement GROQ_API_KEY
    'groq_model':   'llama-3.3-70b-versatile',  # modèle le plus puissant (gratuit)

    # ── OpenAI — Payant (optionnel) ───────────────────────────────────────────
    'openai_api_key': '',
    'openai_model':   'gpt-4o-mini',

    # ══════════════════════════════════════════════════════════════════════════
    #  Serveur local
    # ══════════════════════════════════════════════════════════════════════════
    'host': '127.0.0.1',
    'port': 5000,

    # ══════════════════════════════════════════════════════════════════════════
    #  Applications
    # ══════════════════════════════════════════════════════════════════════════
    'steam_path': r'C:\Program Files (x86)\Steam\Steam.exe',
    'obs_path':   r'C:\Program Files\obs-studio\bin\64bit\obs64.exe',

    # ── OBS WebSocket ─────────────────────────────────────────────────────────
    'obs_host':     'localhost',
    'obs_port':     4455,
    'obs_password': '',

    'language': 'fr-FR',
}
