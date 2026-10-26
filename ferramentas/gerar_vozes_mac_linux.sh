#!/bin/sh
# Grava as falas de Lumi com as vozes neurais Francisca (feminina) e Antonio (masculina) (precisa do Python 3). Rode na pasta do jogo:  sh ferramentas/gerar_vozes_mac_linux.sh
cd "$(dirname "$0")/.." || exit 1
python3 -m pip install --user --upgrade edge-tts || pip3 install --user --upgrade edge-tts
python3 ferramentas/gerar_vozes.py
