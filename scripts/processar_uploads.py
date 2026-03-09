import os
import json
import hashlib
import cv2
import numpy as np
import time
import threading
from PIL import Image, ImageEnhance, ImageOps
from datetime import datetime
from google import genai
from collections import deque

# --- CONFIGURAÇÕES DE PASTA E RATE ---
PASTA_UPLOADS = "uploads/"
PASTA_PREPROCESSADAS = "preprocessadas/"
PASTA_DADOS = "apostas/"

def preprocessar_imagem(caminho, img_nome):
    """Pipeline: Deskew -> Otsu -> Sharp Suave"""
    os.makedirs(PASTA_PREPROCESSADAS, exist_ok=True)
    img = cv2.imread(caminho)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 1. Deskew com Otsu
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    coords = np.column_stack(np.where(th == 0))
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45: angle = -(90 + angle)
    else: angle = -angle
    (h, w) = gray.shape[:2]
    M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    rotated = cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    # 2. Unsharp Mask Suave
    blur_sharp = cv2.GaussianBlur(rotated, (0, 0), 2)
    sharp = cv2.addWeighted(rotated, 1.3, blur_sharp, -0.3, 0)
    
    caminho_proc = os.path.join(PASTA_PREPROCESSADAS, f"proc_{img_nome}")
    cv2.imwrite(caminho_proc, sharp)
    
    # Retorna [Sharp, Original] - Sharp primeiro para o Gemini
    return [Image.open(caminho_proc), Image.open(caminho)]



def validar_euromilhoes(nums, estrelas):
    """Validador de negócio: Firewall anti-alucinação"""
    if len(nums) != 5 or len(estrelas) != 2: return False
    if len(set(nums)) != 5 or len(set(estrelas)) != 2: return False
    if any(n < 1 or n > 50 for n in nums): return False
    if any(e < 1 or e > 12 for e in estrelas): return False
    return True

# --- PROMPT OTIMIZADO ---
PROMPT_FINAL = """
Tu és um auditor de recibos da Santa Casa. Objetivo: Extração perfeita (0 erros).

INSTRUÇÕES DE EXTRAÇÃO:
1. Analisa a Imagem 1 (Processada) e a Imagem 2 (Original).
2. Extrai os números e estrelas.
3. COMPARA: Se a Imagem 1 e 2 divergirem, segue a forma geométrica:
   - [3 vs 8]: O 3 tem abertura à esquerda.
   - [6 vs 8]: O 6 tem topo aberto.
   - [0 vs 8]: O 8 tem cruzamento central.
4. Se um dígito parecer um valor impossível (ex: Estrela 18), reavalia a imagem; é erro de segmentação.

ESTRUTURA JSON (Apenas JSON):
{ "jogos": [ { "tipo": "...", "apostas": [ { "numeros": ["01", ...], "estrelas": ["01", ...] } ] } ] }
"""

def processar_com_multiplas_chaves():
    # [Mantém a tua lógica original de loop e gestão de chaves]
    # ...
    # Antes de guardar:
    dados = json.loads(resposta.text)
    for jogo in dados.get("jogos", []):
        if jogo["tipo"] == "Euromilhões":
            for ap in jogo.get("apostas", []):
                nums = [int(n) for n in ap.get("numeros", [])]
                est = [int(e) for e in ap.get("estrelas", [])]
                if not validar_euromilhoes(nums, est):
                    print(f"⚠️ Rejeitado: Validação falhou para {img_nome}")
                    continue
                # Ordenar para consistência
                ap["numeros"] = sorted([f"{n:02d}" for n in nums])
                ap["estrelas"] = sorted([f"{e:02d}" for e in est])
        
        guardar_jogo(jogo, img_nome, img_hash)

if __name__ == "__main__":
    processar_com_multiplas_chaves()
