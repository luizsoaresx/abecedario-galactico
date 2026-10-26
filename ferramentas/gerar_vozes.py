"""
gerar_vozes.py — grava as falas de Lumi com DUAS vozes neurais gratuitas (Francisca e Antonio) e liga as
gravações ao jogo.

POR QUE: a voz do navegador muda de aparelho para aparelho, às vezes é robótica, e engasga nas sílabas soltas.
Com as falas gravadas em MP3, todo aluno ouve a MESMA voz, as sílabas saem certinhas e sem atraso.
O jogo monta as frases com os pedaços gravados ("Monte a palavra" + "gato"). Só o que não tem gravação
(nome do aluno, frase digitada pela professora) usa a voz do navegador.

VOZES (Microsoft, português do Brasil): Lumi não é menino nem menina, então pode falar com as duas.
  - pt-BR-FranciscaNeural (feminina)  -> audio/falas/francisca/
  - pt-BR-AntonioNeural   (masculina) -> audio/falas/antonio/
  Na tela "Sons do jogo", o botão "Trocar" escolhe entre Francisca e Antonio.

COMO AS SÍLABAS SÃO GRAVADAS:
- Sílabas soltas são gravadas dentro de uma frase de apoio ("A sílaba é: rá.") e o jogo toca só a sílaba:
  assim a voz fala como uma professora (R forte em "rá, ré, rí, rô, rú").
- Palavras separadas ("cá... vá... lô") são gravadas de uma vez só, com o tempo de início de cada sílaba.
- Rodar de novo só grava o que falta e apaga as gravações que o jogo não usa mais (inclusive as da Thalita).

COMO USAR (no seu computador, com internet; leva uns 8 a 15 minutos, porque são duas vozes):
  Windows: instale o Python 3 (python.org — marque "Add Python to PATH") e dê dois cliques em
           ferramentas/gerar_vozes_windows.bat
  Mac/Linux: no terminal, dentro da pasta do jogo:   sh ferramentas/gerar_vozes_mac_linux.sh
  Ou à mão:  pip install -U edge-tts    e depois    python ferramentas/gerar_vozes.py
  Pronto: os arquivos ficam em audio/falas/ e js/data/falas.js é reescrito. Abra o jogo de novo.

Para acrescentar falas, edite ferramentas/falas.txt (uma por linha) ou rode  node ferramentas/listar_falas.js
Observação: o edge-tts usa o serviço de leitura em voz alta do Microsoft Edge. É gratuito e não precisa de conta,
mas não é um produto oficial da Microsoft; para uso comercial, confira os termos de uso.
"""
import asyncio, hashlib, json, os, re, sys, unicodedata

try:
    import edge_tts
    import edge_tts.communicate as _ec
except ImportError:
    sys.exit('Falta instalar o edge-tts. Rode:  pip install -U edge-tts')

# As vozes de Lumi: chave usada no jogo -> (voz da Microsoft, nome que aparece na tela, tipo de voz)
VOZES = {
    'francisca': ('pt-BR-FranciscaNeural', 'Francisca', 'feminina'),
    'antonio': ('pt-BR-AntonioNeural', 'Antonio', 'masculina'),
}
VELOCIDADE = '-6%'          # um pouquinho mais devagar, para crianças
AO_MESMO_TEMPO = 6          # quantas gravações em paralelo
VERSAO = '3'                # muda o nome dos arquivos: trocar este número regrava tudo
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA = os.path.join(RAIZ, 'audio', 'falas')
TEMPOS = os.path.join(RAIZ, 'ferramentas', 'tempos_gravacoes.json')   # onde cada palavra começa em cada arquivo

# Frases de apoio: dão à voz o "clima" de português; o jogo toca só a parte depois dos dois-pontos
APOIO = {
    'sílaba': 'A sílaba é: {}.',
    'sílabas': 'Vamos separar em pedacinhos: {}.',
    'palavras': 'Escute as palavras: {}.',
}
SEPARADOR = '... '          # pausa entre as sílabas (ou palavras) numa sequência

# ---------- Português sempre ----------
# O edge-tts monta o pedido com xml:lang='en-US'. Numa voz multilíngue, um texto curto ("rú") pode sair
# com pronúncia de outra língua. Trocamos para pt-BR e, se o serviço aceitar, marcamos o texto com <lang>.
_mkssml_original = getattr(_ec, 'mkssml', None)
MODO_LANG = 2   # 2 = <lang xml:lang='pt-BR'> + xml:lang pt-BR · 1 = só xml:lang pt-BR · 0 = como o edge-tts manda


def _mkssml_pt(*a, **k):
    s = _mkssml_original(*a, **k)
    if MODO_LANG >= 1:
        s = s.replace("xml:lang='en-US'", "xml:lang='pt-BR'")
    if MODO_LANG >= 2:
        s = re.sub(r"(<prosody[^>]*>)(.*)(</prosody>)",
                   lambda m: m.group(1) + "<lang xml:lang='pt-BR'>" + m.group(2) + "</lang>" + m.group(3), s, flags=re.S)
    return s


if _mkssml_original:
    _ec.mkssml = _mkssml_pt


def chave(t):
    """Igual à função chave() do jogo (js/core/services.js): minúsculas, sem pontuação, sem espaços repetidos."""
    t = t.lower()
    t = re.sub(r'\.\.\.|…', ' ', t)
    t = re.sub(r'[.,!?;:"“”()]', ' ', t)
    return ' '.join(t.split())


def simples(t):
    """Sem acento e sem pontuação, para comparar o texto que a voz devolve com o que pedimos."""
    t = unicodedata.normalize('NFD', t.lower())
    return re.sub(r'[^a-z0-9]', '', ''.join(c for c in t if unicodedata.category(c) != 'Mn'))


def ler_falas():
    """Devolve [(tipo, chave, texto)]. tipo: 'fala', 'sílaba', 'sílabas' ou 'palavras'."""
    itens, vistos = [], set()
    with open(os.path.join(RAIZ, 'ferramentas', 'falas.txt'), encoding='utf-8') as f:
        for linha in f:
            linha = linha.strip()
            if not linha or linha.startswith('#'):
                continue
            m = re.match(r'^\[(sílaba|sílabas|palavras)\]\s*(.+)$', linha)
            if m:
                tipo, resto = m.group(1), m.group(2).strip()
                if tipo == 'sílaba':
                    k, texto = chave(resto), resto
                else:
                    partes = [p.strip() for p in resto.split('|') if p.strip()]
                    k, texto = '|'.join(chave(p) for p in partes), partes
            elif '|' in linha:
                tipo = 'fala'
                k, texto = linha.split('|', 1)
                k, texto = chave(k), texto.strip()
            else:
                tipo, k, texto = 'fala', chave(linha), linha
            if k and (tipo, k) not in vistos:
                vistos.add((tipo, k))
                itens.append((tipo, k, texto))
    return itens


async def vozes_disponiveis():
    try:
        return {v['ShortName'] for v in await edge_tts.list_voices()}
    except Exception as e:
        print('  (não consegui listar as vozes:', e, ')')
        return None


async def sintetizar(texto, destino, voz, marcas=False):
    """Grava o texto em destino (MP3). Com marcas=True, devolve [(segundos, palavra)] de onde cada palavra começa."""
    if marcas:
        try:
            com = edge_tts.Communicate(texto, voz, rate=VELOCIDADE, boundary='WordBoundary')
        except TypeError:   # edge-tts antigo: já manda as palavras sem pedir
            com = edge_tts.Communicate(texto, voz, rate=VELOCIDADE)
    else:
        com = edge_tts.Communicate(texto, voz, rate=VELOCIDADE)
    audio, limites = bytearray(), []
    async for m in com.stream():
        if m['type'] == 'audio':
            audio += m['data']
        elif m['type'] == 'WordBoundary':
            limites.append((round(m['offset'] / 1e7, 3), m.get('text', '')))
    if len(audio) < 500:
        raise RuntimeError('o serviço não devolveu áudio')
    tmp = destino + '.tmp'
    with open(tmp, 'wb') as f:
        f.write(audio)
    os.replace(tmp, destino)
    return [(t, p) for t, p in limites if re.search(r'\w', p)]


async def testar_portugues(voz):
    """Descobre o jeito mais forte de pedir português que o serviço aceita."""
    global MODO_LANG
    os.makedirs(PASTA, exist_ok=True)
    teste = os.path.join(PASTA, '_teste.mp3')
    for modo, nome in ((2, 'português marcado no texto'), (1, 'pedido em português'), (0, 'pedido padrão')):
        MODO_LANG = modo
        try:
            await sintetizar(APOIO['sílaba'].format('rá'), teste, voz)
            print(f'Pronúncia: {nome}')
            break
        except Exception:
            continue
    if os.path.exists(teste):
        os.remove(teste)


def ler_tempos():
    try:
        with open(TEMPOS, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def palavras_do_apoio(tipo):
    return len(re.findall(r'\w+', APOIO[tipo].format('')))


def confere(limites, partes):
    """As últimas palavras gravadas são as sílabas pedidas? Devolve os tempos de início delas (ou None)."""
    n = len(partes)
    if len(limites) < n:
        return None
    fim = limites[-n:]
    for (t, dito), pedido in zip(fim, partes):
        a, b = simples(dito), simples(pedido)
        if not a or not (a == b or a in b or b in a):
            return None
    return [t for t, _ in fim]


async def gravar_voz(chave_voz, voz, itens, tempos, sem, erros):
    """Grava todas as falas com uma voz. Devolve (mapa, seq, arquivos usados, quantas gravou agora)."""
    pasta = os.path.join(PASTA, chave_voz)
    os.makedirs(pasta, exist_ok=True)
    mapa, seq, usados = {}, {}, set()
    novas = 0
    feitos = 0

    def nome_de(*partes):
        return hashlib.sha1('|'.join((VERSAO, voz) + partes).encode('utf-8')).hexdigest()[:12] + '.mp3'

    def caminho(nome):
        return os.path.join(pasta, nome)

    async def gravar_arquivo(nome, texto, marcas):
        """Grava (se ainda não existe) e devolve as marcas de tempo. None se não deu."""
        nonlocal novas
        destino = caminho(nome)
        chave_t = chave_voz + '/' + nome
        if os.path.exists(destino) and os.path.getsize(destino) > 500 and (not marcas or chave_t in tempos):
            return tempos.get(chave_t, [])
        async with sem:
            for tentativa in range(3):
                try:
                    lim = await sintetizar(texto, destino, voz, marcas)
                    novas += 1
                    if marcas:
                        tempos[chave_t] = lim
                    return lim
                except Exception as e:
                    if tentativa == 2:
                        erros.append((f'{chave_voz}: {texto}', str(e)))
                        if os.path.exists(destino):
                            os.remove(destino)
                        return None
                    await asyncio.sleep(1.5)

    async def gravar(tipo, k, texto):
        nonlocal feitos
        if tipo == 'fala':
            nome = nome_de('fala', k)
            if await gravar_arquivo(nome, texto, False) is not None:
                mapa[k] = nome; usados.add(nome)
        elif tipo == 'sílaba':
            nome = nome_de('sílaba', k)
            lim = await gravar_arquivo(nome, APOIO['sílaba'].format(texto), True)
            t = confere(lim or [], [texto]) if lim is not None and len(lim) > palavras_do_apoio('sílaba') else None
            if t:
                mapa[k] = [nome, t[0]]; usados.add(nome)          # toca só a sílaba, a partir de t[0] segundos
            else:                                                  # plano B: a sílaba sozinha
                if lim is not None and os.path.exists(caminho(nome)):
                    os.remove(caminho(nome))
                nome2 = nome_de('sílaba-sozinha', k)
                if await gravar_arquivo(nome2, texto, False) is not None:
                    mapa[k] = nome2; usados.add(nome2)
        else:   # sílabas ou palavras: uma gravação só, com o tempo de cada parte
            nome = nome_de(tipo, k)
            lim = await gravar_arquivo(nome, APOIO[tipo].format(SEPARADOR.join(texto)), True)
            t = confere(lim or [], texto) if lim is not None and len(lim) >= palavras_do_apoio(tipo) + len(texto) else None
            if t:
                seq[k] = [nome, t]; usados.add(nome)
            elif os.path.exists(caminho(nome)):                    # sem tempos confiáveis: o jogo emenda as partes
                os.remove(caminho(nome))
        feitos += 1
        if feitos % 100 == 0:
            print(f'  {VOZES[chave_voz][1]}: {feitos}/{len(itens)} prontas...')

    await asyncio.gather(*(gravar(*it) for it in itens))
    # Apaga gravações desta voz que o jogo não usa mais
    for arq in os.listdir(pasta):
        if arq.endswith('.mp3') and arq not in usados:
            os.remove(os.path.join(pasta, arq))
    return mapa, seq, usados, novas


async def main():
    os.makedirs(PASTA, exist_ok=True)
    itens = ler_falas()
    existentes = await vozes_disponiveis()
    print(f'{len(itens)} falas para conferir, em {len(VOZES)} vozes\n')
    tempos = ler_tempos()
    sem = asyncio.Semaphore(AO_MESMO_TEMPO)
    erros, saida, tempos_usados = [], {}, {}
    total_novas = 0
    for chave_voz, (voz, nome, tipo) in VOZES.items():
        if existentes is not None and voz not in existentes:
            print(f'A voz {voz} não está disponível agora; ela fica de fora.')
            continue
        print(f'Voz {nome} ({tipo}): {voz}')
        await testar_portugues(voz)
        mapa, seq, usados, novas = await gravar_voz(chave_voz, voz, itens, tempos, sem, erros)
        total_novas += novas
        tempos_usados.update({k: v for k, v in tempos.items() if k.startswith(chave_voz + '/') and k.split('/', 1)[1] in usados})
        saida[chave_voz] = {'nome': nome, 'voz': voz, 'tipo': tipo, 'base': f'audio/falas/{chave_voz}/',
                            'mapa': dict(sorted(mapa.items())), 'seq': dict(sorted(seq.items()))}
        print(f'  {nome}: {len(mapa)} falas e {len(seq)} palavras separadas ({novas} gravadas agora)\n')

    # Gravações antigas soltas em audio/falas/ (versões anteriores, com a Thalita) e pastas de vozes que saíram
    apagadas = 0
    for arq in os.listdir(PASTA):
        cam = os.path.join(PASTA, arq)
        if arq.endswith('.mp3') and os.path.isfile(cam):
            os.remove(cam); apagadas += 1
        elif os.path.isdir(cam) and arq not in VOZES:
            for x in os.listdir(cam):
                os.remove(os.path.join(cam, x)); apagadas += 1
            os.rmdir(cam)
    with open(TEMPOS, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(tempos_usados.items())), f, ensure_ascii=False)

    if not saida:
        sys.exit('Nenhuma voz foi gravada (sem internet?). Tente de novo.')
    with open(os.path.join(RAIZ, 'js', 'data', 'falas.js'), 'w', encoding='utf-8') as f:
        f.write('/* falas.js — gerado por ferramentas/gerar_vozes.py: falas gravadas de Lumi (%s).\n' % ', '.join(v['nome'] for v in saida.values()))
        f.write('   vozes.<voz>.mapa: chave da fala -> arquivo (ou [arquivo, segundo onde a sílaba começa])\n')
        f.write('   vozes.<voz>.seq: sílabas (ou palavras) separadas, gravadas de uma vez -> [arquivo, [início de cada parte]]\n')
        f.write('   Não precisa editar: rode o gerador de novo. */\n')
        f.write('window.TS = window.TS || {};\n')
        f.write('TS.FALAS = ' + json.dumps({'versao': int(VERSAO), 'padrao': next(iter(saida)), 'vozes': saida}, ensure_ascii=False, indent=1) + ';\n')
    print(f'Pronto! Vozes no jogo: {", ".join(v["nome"] for v in saida.values())} ({total_novas} gravações novas'
          + (f', {apagadas} gravações antigas apagadas' if apagadas else '') + ').')
    print('Se o jogo já está publicado, envie de novo a pasta audio e o arquivo js/data/falas.js.')
    if erros:
        print(f'{len(erros)} falas não foram gravadas (sem internet?). Rode de novo para tentar:')
        for t, e in erros[:10]:
            print('  -', t, '->', e[:80])

asyncio.run(main())
