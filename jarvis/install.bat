@echo off
echo ============================================
echo   Installation de JARVIS
echo ============================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo ERREUR : Python n'est pas installe.
    echo Telechargez-le sur https://www.python.org/downloads/
    echo Cochez "Add Python to PATH" lors de l'installation.
    pause
    exit /b 1
)

echo Installation des dependances Python...
pip install flask flask-socketio openai psutil requests Pillow

echo.
echo ============================================
echo   Installation terminee !
echo ============================================
echo.
echo Etapes suivantes :
echo   1. Ouvrez config.py avec un editeur de texte
echo   2. Collez votre cle Groq dans groq_api_key (gsk_...)
echo      -^> Cle GRATUITE sur https://console.groq.com ^> API Keys
echo   3. Double-cliquez sur lancer_jarvis.bat
echo.
echo Groq est 100%% gratuit et ne necessite pas de carte bancaire !
echo.
pause
