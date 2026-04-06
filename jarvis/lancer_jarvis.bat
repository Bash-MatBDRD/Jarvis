@echo off
title J.A.R.V.I.S — Intelligence Artificielle
color 0B
echo.
echo  ========================================
echo    J . A . R . V . I . S
echo    Intelligence Artificielle Personnelle
echo  ========================================
echo.
echo  [*] Initialisation des systemes...
pip install -r requirements.txt -q
echo  [*] Lancement de l'interface...
echo.
python launcher.py
pause
