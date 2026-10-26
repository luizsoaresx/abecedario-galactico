/* t08_modelo8_estrelas.js — Modelo 8 — Caça no céu: letras (ou figuras) flutuam pelo quadro como estrelas e planetas;
   a criança toca em TODAS as que combinam com a letra-modelo (Mundo 1: fases 1-1 e 1-4).
   modo 'letra':  estrelas com letras  -> "Toque em todas as estrelas com a letra M"
   modo 'figura': planetas com figuras -> "Toque nas figuras que começam com a letra M" (letra, som e imagem). */
window.TS = window.TS || {};
(function () {
  const { COR, TINTA, txt, carta, painel } = TS.UI;
  const { ELOGIOS, esperar } = TS.AT;
  const Wd = TS.C.W; // banco de palavras
  // Tons claros das estrelas/planetas: [cor, degrau]
  const TONS = [[0xa9d8ff, 0x5fa3dc], [0xffb3d6, 0xd9709f], [0xb6e8bf, 0x5fae6e], [0xd3c6ff, 0x8f78e8], [0xffd9a8, 0xe3a35a]];
  const OURO = [0xffc93c, 0xc98f12];
  // Onde ficam as estrelas (7) e os planetas (5), à direita da letra-modelo e longe de Lumi (canto de cima, à direita)
  const LUGARES = {
    7: [[450, 330], [630, 312], [810, 330], [980, 360], [540, 520], [720, 540], [900, 525]],
    5: [[480, 340], [700, 320], [920, 360], [590, 528], [810, 535]],
  };

  // Estrela de 5 pontas desenhada com polígonos (r = raio externo)
  function pontas(r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5; const rr = i % 2 ? r * 0.5 : r;
      pts.push(new Phaser.Geom.Point(Math.cos(a) * rr, Math.sin(a) * rr));
    }
    return pts;
  }

  TS.Estrela = { pontas, TONS, OURO }; // a demonstração (T07) desenha as mesmas estrelas

  TS.Atividade.prototype.tEstrelas = function (it) {
    const A = this.area;
    const fig = it.modo === 'figura';
    this.pergunta(it.texto, it.fala, 214);

    // ----- À esquerda: a letra-modelo (grande) e quantas já achou -----
    const mc = carta(this, 205, 425, 210, 230, null, { letra: it.letra, fundo: 0xfff6d6, borda: 0xf4d27a });
    A.add(mc);
    this.alto(A, 300, 322, `letra ${it.letra}`, 56);
    const alvos = it.objetos.filter((o) => o.ok).length;
    const cont = this.add.container(205, 588); A.add(cont);
    cont.add(painel(this, 0, 0, 170, 62, COR.branco, 31, 6));
    const contTxt = txt(this, 0, -2, `0 de ${alvos}`, 28, TINTA, { peso: 700 }); cont.add(contTxt);

    // ----- As estrelas (ou planetas), flutuando -----
    const lugares = TS.C.shuffle(LUGARES[it.objetos.length] || LUGARES[7]).slice(0, it.objetos.length);
    const R = 72;
    const objs = it.objetos.map((o, i) => {
      const [x, y] = lugares[i];
      const c = this.add.container(x, y);
      const g = this.add.graphics(); c.add(g);
      const tom = TONS[i % TONS.length];
      c.desenhar = (cor, deg) => {
        g.clear();
        if (fig) {
          // planeta: anel atrás, bola com degrau, anel na frente (meia elipse)
          g.lineStyle(10, deg, 0.55); g.strokeEllipse(0, 6, R * 2.5, R * 0.75);
          g.fillStyle(deg, 1); g.fillCircle(0, 7, R);
          g.fillStyle(cor, 1); g.fillCircle(0, 0, R);
          g.fillStyle(0xffffff, 0.55); g.fillCircle(0, 0, R * 0.78);
        } else {
          g.fillStyle(deg, 1); g.fillPoints(pontas(R).map((p) => ({ x: p.x, y: p.y + 7 })), true);
          g.fillStyle(cor, 1); g.fillPoints(pontas(R), true);
          g.fillStyle(0xffffff, 0.35); g.fillCircle(0, 4, R * 0.36);
        }
      };
      c.desenhar(tom[0], tom[1]);
      if (fig) { const im = this.add.image(0, 0, Wd[o.id].img); im.setScale((R * 1.3) / Math.max(im.width, im.height)); c.add(im); c.im = im; }
      else { const t = txt(this, 0, 4, o.id, 52, TINTA, { peso: 700 }); c.add(t); c.t = t; }
      Object.assign(c, o, { tom });
      c.setSize(R * 2, R * 2).setInteractive({ useHandCursor: true });
      c.on('pointerup', () => tocar(c));
      A.add(c);
      // aparece girando e depois flutua devagar (cada uma no seu ritmo)
      c.setScale(0);
      this.tweens.add({ targets: c, scale: 1, angle: { from: -40, to: 0 }, delay: 120 + i * 70, duration: 380, ease: 'Back.out' });
      this.tweens.add({ targets: c, y: y + Phaser.Math.Between(-12, 12), x: x + Phaser.Math.Between(-10, 10), duration: Phaser.Math.Between(1500, 2300), yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: 500 });
      if (!fig) this.tweens.add({ targets: c, angle: Phaser.Math.Between(-8, 8), duration: Phaser.Math.Between(1800, 2600), yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: 500 });
      return c;
    });

    let achadas = 0;
    const nomeDe = (c) => (fig ? Wd[c.id].f : `letra ${c.id}`);
    const marcar = (c, ajuda) => {
      c.achada = true; c.disableInteractive();
      this.tweens.killTweensOf(c);
      c.desenhar(OURO[0], OURO[1]);
      this.tweens.add({ targets: c, scale: 1.18, angle: 0, yoyo: true, duration: 180 });
      const s = this.add.container(c.x + R * 0.62, c.y - R * 0.62);
      s.add(this.add.circle(0, 0, 24, 0xffffff)); s.add(this.add.circle(0, 0, 20, COR.verde));
      s.add(this.add.image(0, 0, 'svg_g_certo').setDisplaySize(24, 24)); A.add(s);
      s.setScale(0); this.tweens.add({ targets: s, scale: 1, duration: 240, ease: 'Back.out' });
      if (!ajuda) { achadas++; contTxt.setText(`${achadas} de ${alvos}`); }
    };
    const tocar = async (c) => {
      if (this.bloqueado || c.achada) return;
      if (c.ok) {
        TS.Som.tocar('pop', 0.5);
        marcar(c);
        // Figuras: Lumi fala o nome de cada uma. Letras: só o "pop" (a letra já foi dita na pergunta; para ouvir
        // de novo, é só tocar no alto-falante)
        const nome = fig ? TS.Voz.falar(nomeDe(c)) : null;
        if (achadas < alvos) return;
        // achou todas: espera o nome da última figura terminar antes do elogio
        this.registrar('r', true); this.bloqueado = true;
        this.acertou(205, 425, false);
        if (nome) await Promise.race([nome, esperar(this, 3500)]);
        await this.falar(`${Phaser.Utils.Array.GetRandom(ELOGIOS)} ${fig ? `Começam com ${'a letra ' + it.letra}!` : 'Você achou todas!'}`, { expr: 'comemorando' });
        return this.fimRodada(300);
      }
      // errou: a estrela treme e fica laranja um instante
      this.registrar('r', false, null, { resp: fig ? Wd[c.id].t : c.id });
      c.desenhar(0xffd2b0, 0xe3a35a);
      this.time.delayedCall(650, () => c.active && !c.achada && c.desenhar(c.tom[0], c.tom[1]));
      const e = this.errou('r', c);
      TS.Voz.falar(fig ? `Esse é ${Wd[c.id].f}. Começa com ${'a letra ' + Wd[c.id].letra}.` : `Essa é ${'a letra ' + c.id}.`, { fila: true });
      if (e >= 2) {
        // duas tentativas erradas: mostra onde estavam as outras e segue
        this.bloqueado = true;
        await esperar(this, 1200);
        objs.filter((o) => o.ok && !o.achada).forEach((o) => marcar(o, true));
        await TS.Voz.quandoCalar(2500);
        await this.falar(fig ? `Olha: estas começam com ${'a letra ' + it.letra}.` : `Olha: ${'a letra ' + it.letra} estava aqui.`, { expr: 'incentivando' });
        this.fimRodada(500);
      }
    };
    TS.Voz.preparar(`letra ${it.letra}`, ...(fig ? objs.map((o) => Wd[o.id].f) : []));
    this.falaAtual = () => this.falar(it.fala);
    this.time.delayedCall(200, this.falaAtual);
  };
})();
