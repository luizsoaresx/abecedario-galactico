@echo off
chcp 65001 >nul
REM Grava as falas de Lumi com as vozes neurais Francisca (feminina) e Antonio (masculina) (precisa do Python 3 instalado: python.org, marque "Add Python to PATH").
REM De dois cliques neste arquivo. Na primeira vez ele instala o edge-tts. Leva alguns minutos e precisa de internet.
cd /d "%~dp0\.."
echo Instalando o edge-tts (so na primeira vez)...
py -m pip install --user --upgrade edge-tts 2>nul || python -m pip install --user --upgrade edge-tts
echo.
echo Gravando as falas de Lumi nas vozes Francisca e Antonio (8 a 15 minutos)...
py ferramentas\gerar_vozes.py 2>nul || python ferramentas\gerar_vozes.py
echo.
echo Pronto! Abra o jogo de novo (se ele estiver aberto, aperte F5).
pause
