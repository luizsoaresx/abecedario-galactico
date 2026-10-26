/* t07_introducao.js — T07 Introdução da fase: Lumi explica e um dedo-guia mostra como se joga. */
window.TS = window.TS || {};
(function () {
  const { W, COR, TINTA, txt, botao, botaoRedondo, painel, mascote, svgEsc } = TS.UI;

  class Intro extends TS.Cena {
    constructor() { super('Intro'); }

    /* init() roda antes de montar() e recebe os dados enviados por this.ir('Intro', dados):
       { faseId } para uma fase do mapa, { atividadeId } para uma atividade do professor
       ou { atividade, previa: true } quando o professor está pré-visualizando. */
    init(d) {
      this.dados = d;
      this.previa = !!d.previa;
      this.atv = d.atividade || (d.atividadeId ? TS.DB.atividades.get(d.atividadeId) : null);
      this.fase = this.atv ? TS.ATV.comoFase(this.atv) : TS.C.fase(d.faseId);
    }

    montar() {
      const f = this.fase;
      if (!f) return this.scene.start('Tarefas'); // a atividade foi apagada pelo professor
      const m = TS.C.MUNDOS[f.mundo - 1];
      // Fase do mapa: guarda que o aluno está nela (ao sair e voltar, o mapa e o "Continuar" voltam para cá)
      if (!f.custom && !this.previa && this.aluno && this.aluno.perfil === 'aluno') TS.DB.marcarFaseAberta(this.aluno.id, f.id);
      TS.UI.fundo(this, m.bg);
      // Mapa (canto de cima): fase -> Mapa; atividade -> lista de atividades; pré-visualização -> tela de edição do professor
      this.ancorar(botaoRedondo(this, 76, 76, 88, { cor: COR.branco, icone: f.custom ? 'svg_g_voltar' : 'svg_g_mapa', iconeTam: 40, onClick: () => this.voltar() }), -1, -1);
      // Título: [1-3] A última palavra  (fase)  ou  [★] Nome da atividade (atividade do professor)
      const cor = Phaser.Display.Color.HexStringToColor(m.cor).color;
      const tit = TS.UI.pilula(this, 640, 76, f.nome, { numero: f.custom ? '★' : `${f.mundo}-${f.fase}`, corNumero: cor, tam: 32, min: 440 });
      if (tit.larg > 760) tit.setScale(760 / tit.larg);
      this.ancorar(tit, 0, -1);
      this.bibo = mascote(this, 232, 640, 0.66, 'feliz');

      // Quadro branco onde acontece a demonstração, com a regra escrita embaixo
      painel(this, 820, 342, 760, 380, COR.branco, 40);
      this.demo = this.add.container(820, 300);
      this.montarDemo();
      const regra = txt(this, 820, 478, f.intro, 23, '#3A3D66', { fonte: 'Nunito, Arial, sans-serif', peso: 800, bold: false, wrap: 680 });
      if (regra.height > 70) regra.setScale(70 / regra.height);

      botao(this, 662, 616, 286, 96, { cor: COR.azul, icone: 'svg_alto', iconeTam: 44, texto: 'Ouvir', tam: 36, onClick: () => this.explicar() });
      const c = botao(this, 977, 616, 286, 96, { cor: COR.amarelo, icone: 'svg_g_jogar', iconeTam: 36, texto: 'Começar', tam: 36, onClick: () => this.ir('Atividade', this.dados) });
      this.tweens.add({ targets: c, scale: 1.03, yoyo: true, repeat: -1, duration: 650 });
      this.time.delayedCall(400, () => this.explicar());
    }

    voltar() {
      if (this.previa) return TS.App.sairDaPrevia(true);
      this.ir(this.atv ? 'Tarefas' : 'Mapa');
    }

    // Fala a regra da fase e roda a demonstração
    explicar() {
      this.bibo.falar('Olha como eu faço! ' + this.fase.intro);
      this.animarDemo();
    }

    /* Desenha uma miniatura da atividade, conforme a demonstração da fase (tpl). Cada fase tem a SUA demonstração,
       com um exemplo certo do que a criança vai fazer (ex.: 4-3 liga figura e letra; 3-3 leva a figura que rima
       para a caixa verde). */
    montarDemo() {
      const d = this.demo;
      const tpl = this.fase.tpl;
      const s = this;
      const Wc = TS.C.W;
      d.removeAll(true);
      const carta = (x, y, k, t = 130, o) => { const c = TS.UI.carta(s, x, y, t, t, k ? Wc[k].img : null, o); d.add(c); return c; };
      const fig = (x, y, k, t = 130, o = {}) => carta(x, y, k, t, { legenda: Wc[k].t, ...o });
      const letraCarta = (x, y, l, t = 130, o = {}) => carta(x, y, null, t, { letra: l, ...o });
      // Palavra escrita (Mundo 5: leitura)
      const palavraCarta = (x, y, p, w = 150, h = 110, o = {}) => { const c = TS.UI.carta(s, x, y, w, h, null, { palavra: p, ...o }); d.add(c); return c; };
      const modeloAmarelo = { fundo: 0xfff6d6, borda: 0xf4d27a };
      // Botão azul de ouvir (com o som escrito, quando ajuda: "SA", "sss")
      const quadradoOuvir = (x, y, t = 130, texto) => {
        const b = TS.UI.botao(s, x, y, t, t, texto ? { cor: COR.azul, icone: 'svg_alto', iconeTam: t * 0.3, texto, tam: t * 0.24, raio: 28 } : { cor: COR.azul, icone: 'svg_alto', iconeTam: t * 0.5, raio: 28 });
        b.disableInteractive(); d.add(b); return b;
      };
      this.dedo = this.add.image(0, 0, 'dedo').setDepth(50).setVisible(false);
      this.anelDemo = this.add.graphics().setDepth(49).setVisible(false);
      this.cartasDemo = null; this.alvoDemo = null; this.pecaDemo = null; this.linha = null;

      if (tpl.startsWith('contagem')) {
        // Ouvir (ou a figura), o tambor do espaço e as fichas de planeta que acendem a cada batida
        if (tpl === 'contagem_silabas') carta(-230, -10, 'bola', 150); else quadradoOuvir(-230, -10, 140);
        const tam = this.add.image(60, -24, 'svg_tambor').setScale(svgEsc(0.82));
        d.add(tam);
        this.alvoDemo = tam;
        const pil = this.add.graphics(); pil.fillStyle(COR.lilasClaro, 1); pil.fillRoundedRect(-30, 92, 180, 56, 28); d.add(pil);
        this.bolinhas = [0, 1, 2].map((i) => { const b = this.add.image(10 + i * 50, 120, 'svg_g_ficha_vazia').setDisplaySize(40, 40); d.add(b); return b; });
        const ok = TS.UI.botaoRedondo(s, 270, -40, 96, { cor: COR.verde, icone: 'svg_g_certo', iconeTam: 46 }); ok.disableInteractive(); d.add(ok);
      } else if (tpl.startsWith('estrelas')) {
        // A letra-modelo e três estrelas (ou planetas) flutuando: o dedo toca nas duas que combinam
        const ehFig = tpl === 'estrelas_figura';
        letraCarta(-268, -10, ehFig ? 'P' : 'M', 150, modeloAmarelo);
        const E = TS.Estrela;
        const objs = (ehFig ? [['pato', true], ['vaca', false], ['porta', true]] : [['M', true], ['S', false], ['M', true]]).map(([k, ok], i) => {
          const o = this.add.container(-70 + i * 150, i === 1 ? 40 : -40); const g = this.add.graphics(); o.add(g);
          const tom = E.TONS[i];
          o.pintar = (cor, deg) => {
            g.clear();
            if (ehFig) { g.fillStyle(deg, 1); g.fillCircle(0, 6, 56); g.fillStyle(cor, 1); g.fillCircle(0, 0, 56); g.fillStyle(0xffffff, 0.55); g.fillCircle(0, 0, 44); }
            else { g.fillStyle(deg, 1); g.fillPoints(E.pontas(56).map((p) => ({ x: p.x, y: p.y + 6 })), true); g.fillStyle(cor, 1); g.fillPoints(E.pontas(56), true); }
          };
          o.pintar(tom[0], tom[1]); o.tom = tom; o.ok = ok;
          if (ehFig) { const im = this.add.image(0, 0, Wc[k].img); im.setScale(64 / Math.max(im.width, im.height)); o.add(im); }
          else o.add(txt(s, 0, 4, k, 40, TINTA, { peso: 700 }));
          d.add(o);
          return o;
        });
        this.estrelasDemo = objs;
      } else if (tpl.startsWith('escolha') || tpl === 'ler_figura' || tpl === 'ler_palavra') {
        // O modelo (letra, figura, som ou pedacinho) -> três respostas; a do meio é a certa
        const M = {
          escolha_letra: { modelo: () => letraCarta(-268, 0, 'P', 130, modeloAmarelo), ops: ['vaca', 'pato', 'uva'] },          // 1-3
          escolha_silaba: { modelo: () => quadradoOuvir(-268, 0, 130, 'SA'), ops: ['pato', 'sapo', 'vaca'] },                    // 2-4
          escolha_rima: { modelo: () => fig(-268, 0, 'gato', 130, modeloAmarelo), ops: ['vaca', 'pato', 'uva'] },               // 3-2
          escolha_som: { modelo: () => quadradoOuvir(-268, 0, 130, 'sss'), ops: ['vaca', 'sapo', 'uva'] },                      // 4-1
          escolha_qual_letra: { modelo: () => fig(-268, 0, 'pato', 130, modeloAmarelo), ops: ['V', 'P', 'U'], letras: true },    // 4-2
          ler_figura: { modelo: () => palavraCarta(-268, 0, 'GATO', 150, 120, modeloAmarelo), ops: ['pato', 'gato', 'rato'] },   // 5-1
          ler_palavra: { modelo: () => carta(-268, 0, 'gato', 130, modeloAmarelo), ops: ['PATO', 'GATO', 'RATO'], palavras: true }, // 5-2
          escolha: { modelo: () => quadradoOuvir(-268, 0, 120), ops: ['pato', 'sapo', 'vaca'] },                                 // atividade do professor
        }[tpl] || { modelo: () => quadradoOuvir(-268, 0, 120), ops: ['pato', 'sapo', 'vaca'] };
        M.modelo();
        d.add(this.add.image(-168, 0, 'svg_g_seta').setDisplaySize(50, 36));
        this.cartasDemo = M.ops.map((k, i) => (M.letras ? letraCarta(-40 + i * 150, 0, k, 132) : M.palavras ? palavraCarta(-40 + i * 150, 0, k, 136, 100) : carta(-40 + i * 150, 0, k, 132)));
        this.alvoDemo = this.cartasDemo[1];
      } else if (tpl.startsWith('vf') || tpl === 'ler_vf') {
        // Duas figuras com legenda e os botões Sim e Não (rimam? / começam com o mesmo som?)
        const [a, b] = tpl === 'vf_som' ? ['pato', 'peixe'] : ['gato', 'pato'];
        // 5-3: a figura (sem o nome) e a palavra escrita GATO -> sim, está escrito o nome dela
        this.cartasDemo = tpl === 'ler_vf' ? [carta(-110, -62, 'gato', 136), palavraCarta(110, -62, 'GATO', 170, 136, modeloAmarelo)]
          : [fig(-110, -62, a, 136), fig(110, -62, b, 136)];
        const up = TS.UI.botao(s, -100, 78, 170, 68, { cor: COR.verde, icone: 'svg_joinha', iconeTam: 32, texto: 'Sim', tam: 26 });
        const dn = TS.UI.botao(s, 100, 78, 170, 68, { cor: COR.laranja, icone: 'svg_joinha', iconeTam: 32, texto: 'Não', tam: 26 });
        dn.list[1].list[0].setFlipY(true); up.disableInteractive(); dn.disableInteractive();
        d.add([up, dn]);
        this.alvoDemo = up;
      } else if (tpl.startsWith('caixas')) {
        // A figura-modelo no alto, uma figura para levar e as duas caixas: verde (combina) e laranja (não combina)
        const [m, f] = tpl === 'caixas_som' ? ['bola', 'banana'] : ['gato', 'pato'];
        fig(0, -118, m, 92, modeloAmarelo);
        [true, false].forEach((sim) => {
          const x = sim ? -200 : 200; const y = 78;
          const g = this.add.graphics();
          g.fillStyle(sim ? COR.verde : COR.laranja, 1); g.fillRoundedRect(x - 120, y - 46, 240, 92, 22);
          g.fillStyle(sim ? 0xeaf7ec : 0xfff1e6, 1); g.fillRoundedRect(x - 115, y - 41, 230, 82, 18);
          g.fillStyle(sim ? COR.verde : COR.laranja, 1); g.fillCircle(x - 78, y, 26);
          d.add(g);
          d.add(this.add.image(x - 78, y, 'svg_joinha').setDisplaySize(30, 30).setFlipY(!sim));
        });
        this.pecaDemo = fig(0, -6, f, 96); // por cima das caixas
        this.pecaInicio = { x: 0, y: -6 };
        this.alvoPos = { x: -168, y: 78 };
      } else if (tpl === 'montar_letra') {
        // A figura e a palavra sem a primeira letra: _ a t o. A letra "g" vai para a vaga do começo.
        carta(-250, -20, 'gato', 170);
        const slot = this.add.graphics(); TS.UI.vaga(slot, -60, -70, 84, 96); d.add(slot);
        ['a', 't', 'o'].forEach((l, i) => {
          const t = TS.UI.botao(s, 34 + i * 94, -70, 84, 96, { cor: 0xffffff, corEsc: COR.lilasDegrau, texto: l, tam: 44, raio: 18, sombra: false }); t.disableInteractive(); d.add(t);
        });
        this.pecaDemo = TS.UI.botao(s, 60, 80, 84, 96, { cor: COR.amarelo, texto: 'g', tam: 44, raio: 18, sombra: false });
        this.pecaDemo.disableInteractive(); d.add(this.pecaDemo);
        this.pecaInicio = { x: 60, y: 80 };
        this.alvoPos = { x: -60, y: -70 };
      } else if (tpl.startsWith('montar')) {
        // A figura, a primeira sílaba já no lugar e a segunda indo para a vaga: GA + TO
        carta(-240, -20, 'gato', 170);
        const fixa = TS.UI.botao(s, 40, -70, 110, 96, { cor: 0xffffff, corEsc: COR.lilasDegrau, texto: 'GA', tam: 44, raio: 20, sombra: false }); fixa.disableInteractive(); d.add(fixa);
        const slot = this.add.graphics(); TS.UI.vaga(slot, 160, -70, 110, 96); d.add(slot);
        this.pecaDemo = TS.UI.botao(s, 100, 80, 110, 96, { cor: COR.amarelo, texto: 'TO', tam: 44, raio: 20, sombra: false });
        this.pecaDemo.disableInteractive(); d.add(this.pecaDemo);
        this.pecaInicio = { x: 100, y: 80 };
        this.alvoPos = { x: 160, y: -70 };
      } else if (tpl.startsWith('ligar')) {
        // Duas cartas para ligar com uma linha (e uma terceira que não combina)
        const L = {
          ligar_letras: [() => letraCarta(-220, -50, 'B', 120), () => letraCarta(220, 70, 'b', 120), () => letraCarta(220, -80, 'm', 100)], // 1-2
          ligar: [() => fig(-220, -50, 'torta', 120), () => fig(220, 70, 'porta', 120), () => carta(220, -80, 'uva', 100)],               // 3-4 (rima)
          ligar_som: [() => fig(-220, -50, 'pato', 120), () => fig(220, 70, 'pera', 120), () => carta(220, -80, 'vaca', 100)],            // mesmo som
          ligar_letra: [() => fig(-220, -50, 'pato', 120), () => letraCarta(220, 70, 'P', 120), () => letraCarta(220, -80, 'M', 100)],    // 4-3 (figura e letra)
          ligar_leitura: [() => carta(-220, -50, 'gato', 120), () => palavraCarta(220, 70, 'GATO', 170, 100, modeloAmarelo), () => palavraCarta(220, -80, 'BOLA', 150, 84, modeloAmarelo)], // 5-4
        }[tpl] || [() => fig(-220, -50, 'torta', 120), () => fig(220, 70, 'porta', 120), () => carta(220, -80, 'uva', 100)];
        this.cartasDemo = L.map((f) => f());
        this.linha = this.add.graphics();
        d.add(this.linha);
      } else if (tpl.startsWith('falar')) {
        // O que a criança vê, o microfone e o que Lumi ouviu
        const F = {
          falar_silaba: [() => quadradoOuvir(-200, -10, 170, 'CA'), 'carro'],          // 2-5: fale uma palavra que começa com CA
          falar_rima: [() => fig(-200, -10, 'gato', 190, modeloAmarelo), 'rato'],       // 3-5: fale uma palavra que rima com gato
          falar_letra_inicial: [() => letraCarta(-200, -10, 'C', 190, modeloAmarelo), 'carro'], // 4-5: fale uma palavra com a letra C
          falar_letra: [() => { fig(-220, -10, 'carro', 180); letraCarta(-80, -86, 'C', 76, modeloAmarelo); }, 'carro'], // 1-5: a figura com a letra dela
          falar_ler: [() => palavraCarta(-200, -10, 'GATO', 230, 150, modeloAmarelo), 'gato'],   // 5-5: só a palavra escrita, para ler
        }[tpl] || [() => fig(-200, -10, 'carro', 190), 'carro'];                         // atividade do professor: fale o nome
        F[0]();
        const mic = TS.UI.botaoRedondo(s, 120, -30, 150, { cor: COR.rosa, icone: 'svg_microfone', iconeTam: 70 }); mic.disableInteractive(); d.add(mic);
        this.alvoDemo = mic;
        this.ouviDemo = this.add.container(120, 110).setVisible(false);
        const fala = txt(s, 0, 0, `Ouvi: "${F[1]}" ✓`, 26, '#2E9A3E', { peso: 700 });
        const fg = this.add.graphics(); fg.fillStyle(0xeaf7ec, 1); fg.fillRoundedRect(-fala.width / 2 - 22, -26, fala.width + 44, 52, 26);
        this.ouviDemo.add([fg, fala]); d.add(this.ouviDemo);
      }
    }

    // Anima o dedo-guia fazendo a atividade
    animarDemo() {
      const tpl = this.fase.tpl;
      const d = this.demo;
      const dedo = this.dedo;
      this.tweens.killTweensOf(dedo);
      const P = (o) => ({ x: d.x + o.x, y: d.y + o.y }); // posição na tela de algo que está dentro do quadro
      dedo.setVisible(true).setPosition(d.x + 300, d.y + 200).setAlpha(1);
      // anel amarelo que aparece onde o dedo toca (como no protótipo)
      const anel = (alvo) => {
        const a = this.anelDemo; a.clear(); a.lineStyle(6, COR.amarelo, 1); a.strokeCircle(0, 0, 26); a.strokeCircle(0, 0, 42);
        a.setPosition(P(alvo).x + 50, P(alvo).y + 50).setVisible(true).setScale(0.5).setAlpha(1);
        this.tweens.add({ targets: a, scale: 1.1, alpha: 0, duration: 650 });
      };
      // toque(alvo, depois): o dedo vai até o alvo, "aperta" e depois chama a função "depois"
      const toque = (alvo, cb) => this.tweens.add({
        targets: dedo, x: P(alvo).x + 30, y: P(alvo).y + 36, duration: 600, ease: 'Sine.inOut',
        onComplete: () => { anel(alvo); this.tweens.add({ targets: dedo, scale: 0.8, yoyo: true, duration: 120, onComplete: cb }); },
      });

      if (tpl.startsWith('contagem')) {
        this.bolinhas.forEach((b) => b.setTexture('svg_g_ficha_vazia'));
        let n = 0;
        const bate = () => toque(this.alvoDemo, () => {
          TS.Som.tocar('tambor', 0.4);
          this.tweens.add({ targets: this.alvoDemo, scaleY: svgEsc(0.74), yoyo: true, duration: 90 });
          this.bolinhas[n].setTexture('svg_g_ficha_planeta');
          n++;
          if (n < 2) this.time.delayedCall(250, bate); // bola: BO-LA, duas batidas
        });
        bate();
      } else if (tpl.startsWith('estrelas')) {
        const [a, , b] = this.estrelasDemo;
        this.estrelasDemo.forEach((o) => o.pintar(o.tom[0], o.tom[1]));
        const marca = (o) => { TS.Som.tocar('pop', 0.4); o.pintar(TS.Estrela.OURO[0], TS.Estrela.OURO[1]); this.tweens.add({ targets: o, scale: 1.15, yoyo: true, duration: 160 }); };
        toque(a, () => { marca(a); this.time.delayedCall(200, () => toque(b, () => { marca(b); TS.UI.brilho(this, P(b).x, P(b).y); })); });
      } else if (tpl.startsWith('escolha') || tpl.startsWith('vf') || tpl.startsWith('ler_')) {
        if (this.cartasDemo) this.cartasDemo.forEach((c) => { c.desenhar(null); c.selo(false); });
        toque(this.alvoDemo, () => {
          TS.Som.tocar('acerto', 0.4);
          if (this.alvoDemo.desenhar) { this.alvoDemo.desenhar('certo'); this.alvoDemo.selo(true); }
          TS.UI.brilho(this, P(this.alvoDemo).x, P(this.alvoDemo).y);
        });
      } else if (tpl.startsWith('montar') || tpl.startsWith('caixas')) {
        const pc = this.pecaDemo;
        pc.setPosition(this.pecaInicio.x, this.pecaInicio.y).setScale(1);
        toque(pc, () => {
          this.tweens.add({ targets: [pc], x: this.alvoPos.x, y: this.alvoPos.y, scale: tpl.startsWith('caixas') ? 0.7 : 1, duration: 700, ease: 'Sine.inOut' });
          this.tweens.add({ targets: dedo, x: P(this.alvoPos).x + 30, y: P(this.alvoPos).y + 36, duration: 700, ease: 'Sine.inOut', onComplete: () => TS.Som.tocar('acerto', 0.4) });
        });
      } else if (tpl.startsWith('ligar')) {
        this.linha.clear();
        this.cartasDemo.forEach((c) => c.desenhar(null));
        toque(this.cartasDemo[0], () => {
          this.cartasDemo[0].desenhar('sel');
          toque(this.cartasDemo[1], () => {
            TS.Som.tocar('acerto', 0.4);
            this.linha.lineStyle(10, COR.verde, 1).lineBetween(-160, -50, 160, 70);
            this.cartasDemo[0].desenhar('certo');
            this.cartasDemo[1].desenhar('certo');
          });
        });
      } else if (tpl.startsWith('falar')) {
        this.ouviDemo.setVisible(false);
        toque(this.alvoDemo, () => {
          const ondas = this.add.circle(P(this.alvoDemo).x, P(this.alvoDemo).y, 80).setStrokeStyle(8, COR.rosa, 0.8).setDepth(40);
          this.tweens.add({ targets: ondas, scale: 1.5, alpha: 0, duration: 900, repeat: 1, onComplete: () => ondas.destroy() });
          this.time.delayedCall(1300, () => { if (!this.ouviDemo.active) return; TS.Som.tocar('acerto', 0.4); this.ouviDemo.setVisible(true); });
        });
      }
    }
  }

  TS.CENAS.push(Intro);
})();
