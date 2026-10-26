/* Serviços compartilhados: voz (fala em pt-BR), efeitos sonoros e utilidades. */
window.TS = window.TS || {};

TS.U = {
  // Identificador único no formato UUID (o mesmo que o banco de dados usa)
  uid: () => {
    const c = window.crypto;
    if (c && c.randomUUID) { try { return c.randomUUID(); } catch (e) { /* página sem https: usa o jeito abaixo */ } }
    const b = c && c.getRandomValues ? c.getRandomValues(new Uint8Array(16)) : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  },
  hoje: () => new Date().toISOString(),
  diasEntre: (a, b = new Date()) => Math.floor((new Date(b) - new Date(a)) / 86400000),
  fmtData: (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'),
  fmtDataHora: (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'),
  relativo(iso) {
    if (!iso) return 'nunca';
    const d = TS.U.diasEntre(iso);
    if (d <= 0) return 'hoje';
    if (d === 1) return 'ontem';
    if (d < 30) return `há ${d} dias`;
    return TS.U.fmtData(iso);
  },
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  pct: (x) => (isFinite(x) ? Math.round(x * 100) + '%' : '—'),
  semAcento: (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase(),
};

/* Voz de Lumi — dois jeitos de falar, nesta ordem:

   1) GRAVAÇÕES com voz neural (arquivos MP3 em audio/falas/francisca/ e audio/falas/antonio/, listados em js/data/falas.js).
      São geradas UMA VEZ com ferramentas/gerar_vozes.py (vozes pt-BR-FranciscaNeural e pt-BR-AntonioNeural, gratuitas).
      Lumi não é menino nem menina: na tela "Sons do jogo" dá para trocar entre Francisca e Antonio.
      Todo aluno ouve a mesma voz humana, as sílabas saem certinhas e sem engasgos.
      Uma frase que não foi gravada inteira é MONTADA com os pedaços gravados ("Monte a palavra" + "gato"):
      o jogo procura sempre o maior pedaço gravado que cabe (veja montar()).
   2) Com as gravações instaladas, a VOZ DO NAVEGADOR (a do Google, no Chrome) NUNCA é usada. Se alguma parte da
      frase não tiver gravação (um nome de aluno, a palavra que a criança falou, uma frase digitada pelo professor):
      - se a tela mandou uma frase genérica (opts.alt, ex.: "Muito bem!", "Tente novamente!"), Lumi fala essa frase;
      - senão, Lumi fala só as frases gravadas ("Oi, João! Que bom te ver!" -> "Que bom te ver!");
      - se nada puder ser falado, Lumi fica em silêncio (o texto continua escrito na tela).
   3) Só quando NÃO há gravações (ninguém rodou ferramentas/gerar_vozes), o jogo usa a voz do navegador, para não
      ficar mudo: Francisca ou Antonio do Microsoft Edge ou, se não houver, a melhor voz em português dele.

   Detalhes que evitam engasgos na voz do navegador: velocidade normal, "..." vira vírgula, só cancela a fala anterior
   quando há alguma tocando, frases longas são divididas, e sílabas soltas recebem acento ("gá", "tô"). */
TS.Voz = (function () {
  const synth = window.speechSynthesis;
  const CHAVE = 'trilhaDosSons.voz';   // onde guardamos a voz escolhida e a velocidade
  let pref = {};
  try { pref = JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch (e) { /* sem preferências */ }
  const guardar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(pref)); } catch (e) { /* segue */ } };
  if (pref.gravadas === false && !pref.modo) pref.modo = 'navegador'; // preferência da versão anterior

  let voz = null;        // a voz do navegador em uso
  let lista = [];        // vozes em português, da melhor para a pior
  let ativo = true;
  let atual = null;      // guarda a fala em andamento (senão o Chrome pode apagá-la da memória e ela para)
  const player = new Audio(); player.preload = 'auto'; // um só tocador para as gravações (no iPhone, ele é "destravado" no primeiro toque)
  let tocando = false;
  let geracao = 0;       // muda a cada parar(): falas antigas não continuam depois de um cancelamento
  const VELOCIDADES = [0.9, 1, 1.12];  // devagar, normal, rápida
  let velocidade = VELOCIDADES.includes(pref.vel) ? pref.vel : 1;

  /* ---------- Gravações ---------- */
  // js/data/falas.js (gerado por ferramentas/gerar_vozes.py):
  //   mapa: { "monte a palavra": "a1b2.mp3", "rá": ["c3d4.mp3", 1.45] }   (sílaba: arquivo + segundo onde ela começa)
  //   seq:  { "cá|vá|lô": ["e5f6.mp3", [1.9, 2.35, 2.8]] }                (palavra separada, gravada de uma vez só)
  //   falas.js tem uma lista por voz: TS.FALAS.vozes = { francisca: { nome, base, mapa, seq }, antonio: {...} }
  let F = null, GRAV = {}, vozGrav = null, MAPA = {}, SEQ = {}, BASE = 'audio/falas/';
  const lerFalas = () => {
    if (F === TS.FALAS && vozGrav === (GRAV[pref.gravada] ? pref.gravada : vozGrav)) return;
    F = TS.FALAS || {};
    // (formato antigo, de uma voz só: { mapa, seq, base })
    GRAV = F.vozes || (F.mapa && Object.keys(F.mapa).length ? { gravada: { nome: F.nome || 'gravada', base: F.base, mapa: F.mapa, seq: F.seq || {} } } : {});
    vozGrav = GRAV[pref.gravada] ? pref.gravada : GRAV[F.padrao] ? F.padrao : Object.keys(GRAV)[0] || null;
    const v = GRAV[vozGrav] || {};
    MAPA = v.mapa || {}; SEQ = v.seq || {}; BASE = v.base || 'audio/falas/';
  };
  // Há gravações? (com elas, a voz do navegador não é usada nunca, nem se alguém escolheu antes na tela Sons)
  const temGravacoes = () => { lerFalas(); return Object.keys(MAPA).length > 0; };
  // Chave de busca: minúsculas, sem pontuação e sem espaços repetidos ("Monte a palavra!" -> "monte a palavra")
  const chave = (t) => String(t).toLowerCase().replace(/\.\.\.|…/g, ' ').replace(/[.,!?;:"“”()]/g, ' ').replace(/\s+/g, ' ').trim();
  const ANTES = 0.06; // num recorte, começa a procurar o som um pouquinho antes da marca de tempo
  // Uma gravação do mapa -> { arq, de } (de = a partir de qual segundo tocar; as sílabas ficam no fim de uma frase de apoio)
  const peca = (k) => { const v = MAPA[k]; if (!v) return null; return typeof v === 'string' ? { arq: BASE + v, de: 0 } : { arq: BASE + v[0], de: Math.max(0, v[1] - ANTES) }; };
  // Partes faladas em sequência que foram gravadas de uma vez só ("cá", "vá", "lô") -> { arq, de, marcas }
  const seqDe = (partes) => {
    if (!temGravacoes()) return null;
    const v = SEQ[partes.map(chave).join('|')];
    return v ? { arq: BASE + v[0], de: Math.max(0, v[1][0] - ANTES), marcas: v[1] } : null;
  };
  /* Divide o texto em pedaços gravados, com o MENOR número de pedaços.
     Devolve [{ arq, de, pausa }] (pausa maior depois de fim de frase) ou null se faltar algum pedaço. */
  function montar(texto) {
    if (!temGravacoes()) return null;
    const inteira = peca(chave(texto));
    if (inteira) return [{ ...inteira, pausa: 0 }];
    // palavras do texto e onde terminam as frases (ponto, exclamação, interrogação, vírgula, reticências)
    const tokens = [];
    String(texto).replace(/\.\.\.|…/g, ', ').split(/\s+/).forEach((w) => {
      const limpa = chave(w); if (!limpa) { if (tokens.length && /[.!?,;:]/.test(w)) tokens[tokens.length - 1].fim = true; return; }
      limpa.split(' ').forEach((p) => tokens.push({ p, fim: false }));
      if (/[.!?,;:]["”)]*$/.test(w)) tokens[tokens.length - 1].fim = true;
    });
    // Programação dinâmica: melhor[i] = menos pedaços até a palavra i
    const melhor = [0]; const de = [];
    for (let i = 1; i <= tokens.length; i++) {
      melhor[i] = Infinity;
      for (let j = Math.max(0, i - 14); j < i; j++) {
        if (melhor[j] + 1 < melhor[i] && MAPA[tokens.slice(j, i).map((t) => t.p).join(' ')]) { melhor[i] = melhor[j] + 1; de[i] = j; }
      }
    }
    if (!tokens.length || melhor[tokens.length] === Infinity) return null;
    const partes = [];
    for (let i = tokens.length; i > 0; i = de[i]) {
      const j = de[i];
      partes.unshift({ ...peca(tokens.slice(j, i).map((t) => t.p).join(' ')), pausa: i === tokens.length ? 0 : tokens[i - 1].fim ? 280 : 70 });
    }
    return partes;
  }

  /* ---------- Tocador sem emendas (Web Audio) ----------
     Cada arquivo é baixado e decodificado UMA vez (fica guardado), o silêncio das pontas é cortado e as partes
     são agendadas no relógio de áudio, uma colada na outra. Antes, o jogo esperava um arquivo terminar para só
     então pedir o próximo à internet: era isso que engasgava. Se não der (jogo aberto com dois cliques no
     index.html, velocidade diferente de "normal", navegador antigo), usa o tocador comum (tocarHtml). */
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, saida = null;
  const fontes = new Set();     // sons agendados (para poder parar)
  const relogios = new Set();   // avisos agendados (aoParte e fim)
  const pendentes = new Set();  // falas esperando terminar (o parar() encerra todas)
  function contexto() {
    if (!AC || location.protocol === 'file:') return null; // pelo arquivo (file://) o navegador não deixa ler os MP3 assim
    if (!ctx) { try { ctx = new AC(); saida = ctx.createGain(); saida.connect(ctx.destination); } catch (e) { ctx = null; return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const guardados = {};          // arquivo -> Promise<{ buf, pk }>
  const JANELA = 0.005, LIMIAR = 0.01;
  // Volume máximo a cada 5 ms (para achar onde o som começa e termina)
  function picos(buf) {
    const d = buf.getChannelData(0), n = Math.max(1, Math.round(buf.sampleRate * JANELA)), pk = new Float32Array(Math.ceil(d.length / n));
    for (let w = 0; w < pk.length; w++) {
      let m = 0; const fim = Math.min(d.length, (w + 1) * n);
      for (let i = w * n; i < fim; i++) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > m) m = v; }
      pk[w] = m;
    }
    return pk;
  }
  function carregar(arq) {
    const c = contexto(); if (!c) return Promise.reject(new Error('sem Web Audio'));
    if (!guardados[arq]) {
      guardados[arq] = fetch(arq).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then((ab) => new Promise((ok, erro) => { const p = c.decodeAudioData(ab, ok, erro); if (p && p.then) p.then(ok, erro); }))
        .then((buf) => ({ buf, pk: picos(buf) }));
      guardados[arq].catch(() => { delete guardados[arq]; });
    }
    return guardados[arq];
  }
  // Onde o som de verdade começa e termina, a partir do segundo "de" (sem o silêncio das pontas)
  function pontas(g, de = 0) {
    const pk = g.pk, dur = g.buf.duration;
    let a = Math.max(0, Math.floor(de / JANELA)); while (a < pk.length && pk[a] < LIMIAR) a++;
    let b = pk.length - 1; while (b > a && pk[b] < LIMIAR * 0.6) b--;
    if (a >= pk.length) return [de, dur];
    return [Math.max(de, a * JANELA - 0.015), Math.min(dur, (b + 1) * JANELA + 0.06)];
  }
  const comPrazo = (p, ms) => Promise.race([p, new Promise((_, nao) => setTimeout(() => nao(new Error('demorou')), ms))]);

  async function tocarWeb(lista, minha, aoParte) {
    const c = contexto(); if (!c) return false;
    let gs;
    try { gs = await comPrazo(Promise.all(lista.map((p) => carregar(p.arq))), 8000); } catch (e) { return false; }
    if (minha !== geracao) return true;
    if (c.state !== 'running') { try { await comPrazo(c.resume(), 600); } catch (e) { /* segue */ } }
    if (c.state !== 'running' || minha !== geracao) return minha !== geracao;
    return new Promise((resolve) => {
      let t = c.currentTime + 0.03;
      const avisos = [];
      lista.forEach((p, i) => {
        const g = gs[i]; const [a, b] = pontas(g, p.de || 0);
        const s = c.createBufferSource(); s.buffer = g.buf; s.connect(saida);
        s.start(t, a, Math.max(0.01, b - a));
        fontes.add(s); s.onended = () => fontes.delete(s);
        if (p.marcas) p.marcas.forEach((m, k) => avisos.push([t + Math.max(0, pontas(g, Math.max(a, m - ANTES))[0] - a), k]));
        else avisos.push([t, i]);
        t += (b - a) + (p.pausa || 0) / 1000;
      });
      tocando = true;
      const meus = [];
      const agendar = (fn, quando) => { const h = setTimeout(() => { relogios.delete(h); fn(); }, Math.max(0, (quando - c.currentTime) * 1000)); relogios.add(h); meus.push(h); };
      const acabar = (ok) => {
        meus.forEach((h) => { clearTimeout(h); relogios.delete(h); });
        pendentes.delete(acabar);
        if (minha === geracao) tocando = false;
        resolve(ok);
      };
      pendentes.add(acabar);
      if (aoParte) avisos.forEach(([q, k]) => agendar(() => { if (minha === geracao) aoParte(k); }, q));
      agendar(() => acabar(true), t + 0.02);
    });
  }

  // Tocador comum (um elemento <audio>): usado quando o Web Audio não está disponível
  function tocarHtml(lista, minha, aoParte) {
    return new Promise((resolve) => {
      let i = 0; const meus = [];
      const prox = () => {
        if (minha !== geracao || i >= lista.length) { tocando = false; return resolve(true); }
        const p = lista[i];
        let terminou = false;
        const fim = (ok) => {
          if (terminou) return; terminou = true;
          player.onended = player.onerror = player.onplaying = null;
          meus.forEach(clearTimeout);
          if (!ok) { tocando = false; return resolve(i > 0); }  // arquivo não abriu: avisa para usar a voz do navegador
          i++; setTimeout(prox, p.pausa || 0);
        };
        player.onended = () => fim(true);
        player.onerror = () => fim(false);
        player.src = p.arq + (p.de ? '#t=' + p.de.toFixed(3) : '');
        const rate = Math.min(1.25, Math.max(0.85, velocidade));
        player.playbackRate = rate;
        if (aoParte) {
          if (p.marcas) player.onplaying = () => { player.onplaying = null; p.marcas.forEach((m, k) => meus.push(setTimeout(() => { if (minha === geracao) aoParte(k); }, Math.max(0, (m - p.de) * 1000 / rate)))); };
          else aoParte(i);
        }
        tocando = true;
        const pr = player.play();
        if (pr && pr.catch) pr.catch(() => fim(false));
      };
      prox();
    });
  }
  // Toca uma lista de gravações. aoParte(i) avisa quando cada parte começa. Devolve Promise(true se tocou).
  async function tocarPartes(lista, minha, aoParte) {
    if (velocidade === 1 && contexto()) {
      if (await tocarWeb(lista, minha, aoParte)) return true;
      if (minha !== geracao) return true;
    }
    return tocarHtml(lista, minha, aoParte);
  }
  /* Já baixa as gravações do que vai ser falado em seguida (texto, ou lista de partes como ["cá", "vá", "lô"]).
     As telas chamam no começo da rodada; assim, na hora de falar, não há espera pela internet. */
  function preparar(...itens) {
    if (!temGravacoes() || !contexto()) return;
    itens.forEach((it) => {
      if (!it) return;
      const lista = Array.isArray(it) ? (seqDe(it) ? [seqDe(it)] : it.map((p) => peca(chave(p))).filter(Boolean)) : (montar(it) || []);
      lista.forEach((p) => carregar(p.arq).catch(() => {}));  // (p.arq já vem com a pasta da voz)
    });
  }

  /* ---------- Voz do navegador ---------- */
  // Nota de cada voz: quanto maior, melhor para Lumi
  function nota(v) {
    const lang = String(v.lang || '').replace('_', '-');
    let n = 0;
    if (/^pt-BR/i.test(lang)) n += 100; else if (/^pt/i.test(lang)) n += 40; else return -1;
    if (/Natural|Neural|Online/i.test(v.name)) n += 40;                                  // vozes neurais (Edge): as mais humanas
    if (/Thalita/i.test(v.name)) n += 34;                                                 // a mais nova da Microsoft
    if (/Francisca|Leila|Yara|Manuela|Brenda|Elza|Giovanna|Leticia/i.test(v.name)) n += 30; // femininas (Microsoft)
    if (/Luciana|Fernanda|Joana|Catarina|Vit[oó]ria|Camila|Maria|Helena|Raquel/i.test(v.name)) n += 25; // femininas (Apple, Windows)
    if (/Google/i.test(v.name)) n += 28;                                                   // Chrome: voz do Google (feminina)
    if (/Daniel|Ant[oô]nio|Felipe|Ricardo|Humberto|Donato|F[aá]bio|J[uú]lio|Nicolau|Val[eé]rio|Thiago|Macerio|male\b|masculin/i.test(v.name)) n -= 60; // masculinas
    if (v.localService) n += 2; // desempate: voz instalada começa mais rápido
    return n;
  }
  // Só Francisca e Antonio. Se o navegador não tiver nenhuma das duas, fica só a melhor voz em português dele.
  const PERMITIDAS = /Francisca|Ant[oô]nio/i;
  function escolher() {
    if (!synth) return;
    const pt = synth.getVoices().filter((v) => nota(v) >= 0).sort((a, b) => nota(b) - nota(a));
    const fa = pt.filter((v) => PERMITIDAS.test(v.name)).sort((a, b) => (/Francisca/i.test(b.name) - /Francisca/i.test(a.name)) || nota(b) - nota(a));
    lista = fa.length ? fa : pt.slice(0, 1);
    voz = (pref.nome && lista.find((v) => v.name === pref.nome)) || lista[0] || null;
  }
  if (synth) { escolher(); if (synth.addEventListener) synth.addEventListener('voiceschanged', escolher); else synth.onvoiceschanged = escolher; }

  // Nome curto: "Microsoft Francisca Online (Natural) - Portuguese (Brazil)" -> "Francisca (natural)"
  const nomeCurto = (v) => (v ? v.name.replace(/^Microsoft\s+/i, '').replace(/\s*-\s*Portugu[eê]s.*$/i, '').replace(/\s*-\s*Portuguese.*$/i, '')
    .replace(/\s*Multilingual/i, '').replace(/\s*Online\s*\(Natural\)/i, ' (natural)').trim() : 'padrão do navegador');
  // Texto que vai para a voz: reticências viram vírgula (pausa curta) e espaços repetidos somem
  const paraFala = (t) => String(t).replace(/\s*(\.\.\.|…)\s*/g, ', ').replace(/,\s*([,.!?])/g, '$1').replace(/^[,\s]+/, '').replace(/\s+/g, ' ').trim();
  // Corta textos compridos em frases (o Chrome interrompe falas com mais de ~15 segundos)
  const frases = (t) => (t.length <= 180 ? [t] : t.match(/[^.!?]+[.!?]*\s*/g).map((x) => x.trim()).filter(Boolean));

  // Está falando alguma coisa agora? (voz do navegador, gravação tocando ou fala ainda carregando a gravação)
  let falaAtiva = 0; // geração da fala que ainda não terminou (0 = nenhuma)
  const ocupada = () => !!((synth && (synth.speaking || synth.pending)) || tocando || (falaAtiva && falaAtiva === geracao));
  // Espera a fala atual terminar (no máximo maxMs). Usado para uma fala não cortar a outra.
  function quandoCalar(maxMs = 3000) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const olhar = () => (!ocupada() || Date.now() - t0 > maxMs ? resolve() : setTimeout(olhar, 50));
      olhar();
    });
  }

  // Fala com a voz do navegador (usada quando falta gravação)
  function sintetizar(texto, opts, minha, fim) {
    if (!synth) { setTimeout(fim, opts.semVozMs ?? 300); return; }
    const rate = Math.min(1.3, Math.max(0.8, Math.max(0.9, opts.rate ?? 1) * velocidade));
    let dito = opts.dito || paraFala(texto);
    if (/^\p{L}{1,6}$/u.test(dito)) dito += '.'; // uma sílaba ou palavra sozinha: o ponto faz a voz falar inteira
    const partes = frases(dito);
    const falarParte = (i) => {
      if (minha !== geracao) return fim();
      if (i >= partes.length) return fim();
      const u = new SpeechSynthesisUtterance(partes[i]);
      u.lang = (voz && voz.lang) || 'pt-BR'; if (voz) u.voice = voz;
      u.rate = rate; u.pitch = opts.pitch ?? 1.0; u.volume = opts.volume ?? 1;
      let acabou = false, seguranca = null;
      const proxima = () => { if (!acabou) { acabou = true; clearTimeout(seguranca); falarParte(i + 1); } };
      // Segurança: alguns navegadores não avisam quando a fala termina (prazo largo para não cortar a fala)
      const prazo = (extra) => { clearTimeout(seguranca); seguranca = setTimeout(proxima, extra + partes[i].length * 160 / rate); };
      u.onstart = () => { prazo(2500); if (i === 0 && opts.onstart) opts.onstart(); };
      u.onend = proxima; u.onerror = proxima;
      if (opts.onboundary) u.onboundary = opts.onboundary;
      atual = u;
      prazo(8000);
      if (synth.paused) synth.resume(); // o Chrome às vezes fica "pausado" depois de trocar de aba
      synth.speak(u);
    };
    falarParte(0);
  }

  /* Fala um texto. Devolve uma Promise que termina quando a fala acaba (para usar com await).
     opts: rate, pitch, volume, onstart, onend, fila: true = espera a fala atual acabar em vez de cortá-la. */
  function falar(texto, opts = {}) {
    if (opts.fila) {
      const g = geracao;
      return quandoCalar(4000).then(() => (g === geracao ? falar(texto, { ...opts, fila: false }) : undefined));
    }
    return new Promise((resolve) => {
      const minha = ++geracao;
      let feito = false;
      const fim = () => { if (!feito) { feito = true; if (falaAtiva === minha) falaAtiva = 0; opts.onend && opts.onend(); resolve(); } };
      if (!ativo || !texto || !String(texto).trim()) { setTimeout(fim, opts.semVozMs ?? 300); return; }
      const cancelou = pararTudo();
      falaAtiva = minha;
      if (temGravacoes() && !opts.semGravacao) {
        // Só gravações: a frase inteira, a frase genérica (alt) ou as frases gravadas dela; senão, silêncio
        const partes = montar(texto) || (opts.alt && montar(opts.alt)) || soGravadas(texto);
        if (!partes) { avisarFalta(texto); setTimeout(fim, opts.semVozMs ?? 300); return; }
        if (opts.onstart) opts.onstart();
        tocarPartes(partes, minha).then(() => fim()); // se um arquivo não abrir, fica em silêncio (nunca a voz do navegador)
        return;
      }
      // Sem gravação: voz do navegador (depois de um cancel(), espera um instante, senão o Chrome pode ignorar a fala nova)
      if (cancelou) setTimeout(() => sintetizar(texto, opts, minha, fim), 80); else sintetizar(texto, opts, minha, fim);
    });
  }

  /* Frases de um texto que têm gravação ("Oi, João! Que bom te ver!" -> só "Que bom te ver!").
     Devolve a lista de gravações ou null se nenhuma frase tiver gravação. */
  function soGravadas(texto) {
    const frasesTxt = String(texto).replace(/\.\.\.|…/g, ',').split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
    if (frasesTxt.length < 2) return null;
    const ok = frasesTxt.map((f) => montar(f)).filter(Boolean);
    if (!ok.length) return null;
    const lista = [];
    ok.forEach((ps, i) => ps.forEach((p, j) => lista.push({ ...p, pausa: j === ps.length - 1 && i < ok.length - 1 ? 280 : p.pausa })));
    return lista;
  }
  // Para quem testa o jogo: mostra no console as falas que ficaram sem gravação
  const faltas = new Set();
  function avisarFalta(texto) { if (!faltas.has(texto)) { faltas.add(texto); try { console.info('[voz] sem gravação, Lumi não falou:', texto); } catch (e) { /* segue */ } } }

  /* Fala várias partes (ex.: as sílabas "cá", "vá", "lô") e avisa quando cada uma começa (aoParte(i)),
     para o jogo acender o bloco certo.
     1) Se a palavra separada foi gravada de uma vez só (falas.js > seq), toca essa gravação: a voz já fala pausado,
        sem emendas, e os avisos seguem as marcas de tempo de cada sílaba.
     2) Se cada parte tem gravação própria, toca as partes coladas (tocador sem emendas) com uma pausa entre elas.
     3) Senão, a voz do navegador fala tudo numa fala só (sílabas separadas por ponto; palavras por vírgula). */
  function falarSequencia(partes, aoParte, opts = {}) {
    let mostradas = 0;
    const mostrar = (ate) => { while (mostradas <= ate && mostradas < partes.length) aoParte(mostradas++); };
    if (ativo && temGravacoes()) {
      const s = seqDe(partes);
      const cada = partes.map((p) => peca(chave(p)));
      let lista = s ? [s] : cada.every(Boolean) ? cada.map((p, i) => ({ ...p, pausa: i < cada.length - 1 ? (opts.pausa ?? 420) : 0 })) : null;
      // partes que são frases (contar palavras): monta cada uma com os pedaços gravados
      if (!lista) { const ms = partes.map((p) => montar(p)); if (ms.every(Boolean)) lista = ms.flatMap((m, i) => m.map((p, j) => ({ ...p, pausa: j === m.length - 1 && i < ms.length - 1 ? (opts.pausa ?? 420) : p.pausa }))); }
      if (!lista) {
        // sem gravação para estas partes: acende os blocos no tempo, em silêncio (nunca a voz do navegador)
        avisarFalta(partes.join(' | '));
        return new Promise((resolve) => { let i = 0; const passo = () => { mostrar(i++); if (i < partes.length) setTimeout(passo, opts.intervalo || 480); else setTimeout(resolve, 300); }; passo(); });
      }
      if (lista) {
        return new Promise((resolve) => {
          const minha = ++geracao;
          pararTudo();
          tocarPartes(lista, minha, mostrar).then((ok) => {
            if (minha !== geracao) return resolve();
            mostrar(partes.length - 1); resolve(); // (se um arquivo não abrir, segue em silêncio)
          });
        });
      }
    }
    return pelaVozDoNavegador(partes, mostrar, opts);
  }
  function pelaVozDoNavegador(partes, mostrar, opts) {
    const sep = opts.sep || '... ';
    const sepFala = opts.sepFala || '. ';
    const texto = partes.join(sep);
    const ditas = partes.map(paraFala);
    const inicios = []; let pos = 0;
    ditas.forEach((p) => { inicios.push(pos); pos += p.length + sepFala.length; });
    let relogio = null, proxima = 0;
    const porTempo = () => { // plano B: o navegador não informa a posição da fala, então seguimos o relógio
      clearInterval(relogio);
      relogio = setInterval(() => { mostrar(++proxima); if (proxima >= partes.length) clearInterval(relogio); }, opts.intervalo || 480);
    };
    let recebeuPosicao = false;
    return falar(texto, {
      ...opts,
      semGravacao: true,
      dito: ditas.join(sepFala) + (sepFala.trim() === '.' ? '.' : ''),
      onstart: () => { mostrar(0); setTimeout(() => { if (!recebeuPosicao) porTempo(); }, 400); },
      onboundary: (e) => { recebeuPosicao = true; let k = 0; inicios.forEach((ini, i) => { if (e.charIndex >= ini) k = i; }); proxima = k; mostrar(k); },
      semVozMs: partes.length * 600,
    }).then(() => quandoCalar(3000)) // segurança: alguns navegadores avisam o fim antes da última sílaba sair; espera a voz calar de verdade
      .then(() => { clearInterval(relogio); mostrar(partes.length - 1); });
  }

  // Para a gravação e a voz. Devolve true se havia alguma fala para cancelar.
  function pararTudo() {
    let havia = false;
    if (tocando || !player.paused || fontes.size) {
      try { player.pause(); } catch (e) { /* segue */ }
      fontes.forEach((s) => { try { s.stop(); } catch (e) { /* já parou */ } }); fontes.clear();
      relogios.forEach(clearTimeout); relogios.clear();
      [...pendentes].forEach((acabar) => acabar(true));
      tocando = false; havia = true;
    }
    if (synth && (synth.speaking || synth.pending)) { synth.cancel(); havia = true; }
    return havia;
  }

  // O que mostrar na tela "Sons do jogo"
  function descricao() {
    lerFalas();
    if (temGravacoes()) return { gravada: true, nome: `Voz gravada: ${(GRAV[vozGrav] || {}).nome || 'neural'}`,
      dica: Object.keys(GRAV).length > 1 ? 'Toque em Trocar para ouvir a outra voz (Francisca ou Antonio).' : 'Voz gravada: igual em todos os aparelhos.' };
    const n = nomeCurto(voz);
    return { gravada: false, nome: `Voz do navegador: ${n}`,
      dica: Object.keys(GRAV).length ? 'Gravações desligadas: toque em Trocar para voltar a elas.' : 'Dica: rode ferramentas/gerar_vozes (veja o LEIA-ME) para a voz gravada de Francisca e Antonio.' };
  }
  // Vozes que dá para escolher: com gravações, só as gravadas (Francisca, Antonio); sem elas, as do navegador permitidas
  function opcoes() {
    lerFalas(); if (synth && !lista.length) escolher();
    if (Object.keys(GRAV).length) return Object.keys(GRAV).map((k) => ({ gravada: k }));
    return lista.map((v) => ({ v }));
  }

  return {
    falar,
    falarSequencia,
    preparar,
    parar: () => { geracao++; pararTudo(); },
    // No celular, a voz só funciona depois de um toque: o botão Jogar chama destravar()
    destravar: () => {
      if (synth && ativo) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'pt-BR'; synth.speak(u); }
      const c = temGravacoes() ? contexto() : null;
      if (c) { try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); } catch (e) { /* segue */ } }
      // "destrava" o tocador de gravações (iPhone): toca um silêncio curtinho
      try { player.src = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAABgAAAVIAnZ2dnZ2dnZ2dnZ2dnZ2dnbGxsbGxsbGxsbGxsbGxsbGxxMTExMTExMTExMTExMTExNjY2NjY2NjY2NjY2NjY2NjY7Ozs7Ozs7Ozs7Ozs7Ozs7Oz/////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQEUQAAAAAAAAFSti+n7wAAAAAAAAAAAAAAAAD/8xDEAAAAA0gAAAAATEFNRTMuMTAwVVVVVf/zEMQNAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxBoAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDEJwAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMQ0AAADSAAAAABVVVVVVVVVVVVVVVVV//MQxEEAAANIAAAAAFVVVVVVVVVVVVVVVVU='; player.volume = 0; const pr = player.play(); if (pr && pr.then) pr.then(() => { player.pause(); player.volume = 1; }).catch(() => { player.volume = 1; }); } catch (e) { /* segue */ }
    },
    falando: ocupada,
    quandoCalar,
    setAtivo: (v) => { ativo = v; if (!v) pararTudo(); },
    ativo: () => ativo,
    disponivel: () => !!synth || temGravacoes(),
    temGravacoes,
    descricao,
    nomeVoz: () => nomeCurto(voz),
    vozFeminina: () => !!voz && nota(voz) >= 120,
    // Tela Sons: trocar de voz (passa para a próxima da lista) e de velocidade
    quantasVozes: () => opcoes().length,
    // Tela Sons: passa para a próxima voz (Francisca gravada -> Antonio gravado -> vozes do navegador -> ...)
    proximaVoz() {
      const ops = opcoes(); if (!ops.length) return descricao().nome;
      const i = ops.findIndex((o) => (temGravacoes() ? o.gravada === vozGrav : o.v === voz));
      const o = ops[(i + 1) % ops.length];
      if (o.gravada) { pref.modo = 'gravada'; pref.gravada = o.gravada; }
      else { pref.modo = 'navegador'; voz = o.v; pref.nome = o.v.name; }
      delete pref.gravadas; guardar(); F = null; lerFalas();
      return descricao().nome;
    },
    velocidade: () => velocidade,
    setVelocidade(v) { if (VELOCIDADES.includes(v)) { velocidade = v; pref.vel = v; guardar(); } },
    VELOCIDADES,
    montar, chave, soGravadas, faltas, // para testes e para a ferramenta que lista as falas
  };
})();

/* Efeitos sonoros (Kenney Interface Sounds / Music Jingles, CC0). */
TS.Som = (function () {
  const cache = {};
  let ativo = true;
  function tocar(k, vol = 0.6) {
    if (!ativo || !TS.ASSETS || !TS.ASSETS.snd[k]) return;
    try {
      cache[k] = cache[k] || new Audio(TS.ASSETS.snd[k]);
      const a = cache[k].cloneNode();
      a.volume = vol;
      a.play().catch(() => {});
    } catch (e) { /* sem áudio */ }
  }
  return { tocar, setAtivo: (v) => (ativo = v), ativo: () => ativo };
})();
