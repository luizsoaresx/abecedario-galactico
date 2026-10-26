/* t03_login_aluno.js — T03 Login do aluno: nome de usuário e senha, pelo teclado na tela ou pelo teclado do computador.
   (A senha por figuras foi retirada: era fácil de adivinhar e não protegia os dados do aluno.) */
window.TS = window.TS || {};
(function () {
  const { COR, TINTA, txt, botao, botaoRedondo, painel, mascote, balao } = TS.UI;
  const PX = 857;                 // centro do quadro branco (x)
  const CAMPO_W = 700, CAMPO_H = 72;

  class LoginAluno extends TS.Cena {
    constructor() { super('LoginAluno'); }

    montar() {
      TS.UI.fundo(this, 'bg_abertura');
      // Tudo o que muda na tela fica guardado em "estado"
      this.estado = { campo: 'login', login: '', senha: '' };

      // Lumi, balão de fala, botão de voltar e alto-falante
      this.bibo = mascote(this, 200, 668, 0.55, 'feliz');
      this.balao = balao(this, 220, 206, 'Digite seu nome de usuário e sua senha.', 360, 'esq', { tam: 24 });
      this.botaoVoltar(() => this.ir('Acesso'));
      botaoRedondo(this, 362, 340, 84, { cor: COR.azul, icone: 'svg_alto', onClick: () => this.instruir() });

      // Quadro branco à direita com os dois campos (login e senha)
      painel(this, PX, 359, 775, 662, COR.branco, 36);
      this.campos = {};
      [['login', 'svg_g_usuario', 96], ['senha', 'svg_g_senha', 186]].forEach(([k, ic, y]) => {
        const c = this.add.container(PX, y);
        const g = this.add.graphics(); c.add(g); c.g = g;
        c.add(this.add.image(-CAMPO_W / 2 + 40, 0, ic).setDisplaySize(30, 30));
        const t = txt(this, -CAMPO_W / 2 + 78, 0, '', 34, TINTA, { ox: 0, peso: 600 }); c.add(t); c.t = t;
        c.setSize(CAMPO_W, CAMPO_H).setInteractive({ useHandCursor: true });
        c.on('pointerup', () => { this.estado.campo = k; this.atualizar(); }); // tocar no campo = escolher o campo
        this.campos[k] = c;
      });

      // Teclado de letras e o botão Entrar
      this.teclado = this.add.container(0, 0);
      this.montarTeclado();
      this.btEntrar = botao(this, PX, 620, 320, 84, { cor: COR.verde, icone: 'ico_right', iconeTam: 34, texto: 'Entrar', tam: 32, onClick: () => this.entrarNoJogo() });

      // Teclado do computador: escutamos direto na janela do navegador
      const tec = (e) => {
        if (!this.scene.isActive()) return;
        if (e.key === 'Backspace') this.tecla('⌫');
        else if (e.key === 'Enter') this.entrarNoJogo();
        else if (e.key === 'Tab') { e.preventDefault(); this.estado.campo = this.estado.campo === 'login' ? 'senha' : 'login'; this.atualizar(); }
        else if (/^[a-z0-9._]$/i.test(e.key)) this.tecla(e.key.toUpperCase());
        else return;
        e.preventDefault();
      };
      window.addEventListener('keydown', tec);
      this.events.once('shutdown', () => window.removeEventListener('keydown', tec)); // para de escutar ao sair

      this.atualizar();
      this.time.delayedCall(300, () => this.instruir());
    }

    // Lumi explica o que fazer
    instruir() {
      const t = 'Digite seu nome de usuário e sua senha.';
      this.balao.setText(t);
      this.bibo.falar(`${t} Se precisar, peça ajuda para o professor.`);
    }

    // Monta o teclado: 4 linhas de teclas claras com degrau lilás; a tecla de apagar é amarela
    montarTeclado() {
      const linhas = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL.', 'ZXCVBNM⌫'];
      linhas.forEach((l, li) => {
        l.split('').forEach((ch, ci) => {
          const apagar = ch === '⌫';
          const x0 = 538 + (li === 3 ? 71 : 0) + ci * 71;
          const b = botao(this, apagar ? x0 + 34 : x0, 272 + li * 67, apagar ? 134 : 62, 56, {
            cor: apagar ? COR.amarelo : COR.tecla, texto: apagar ? undefined : ch, icone: apagar ? 'svg_g_voltar' : undefined, iconeTam: 26,
            tam: 26, raio: 14, degrau: 5, sombra: false, onClick: () => this.tecla(ch),
          });
          this.teclado.add(b);
        });
      });
    }

    // Uma tecla foi apertada
    tecla(ch) {
      const e = this.estado;
      TS.Som.tocar('toque', 0.4);
      if (ch === '⌫') e[e.campo] = e[e.campo].slice(0, -1); // apaga a última letra
      else if (e[e.campo].length < 24) e[e.campo] += ch;     // acrescenta a letra
      this.atualizar();
    }

    // Redesenha os campos e as miniaturas sempre que o estado muda
    atualizar() {
      const e = this.estado;
      Object.entries(this.campos).forEach(([k, c]) => {
        const foco = e.campo === k;
        c.g.clear();
        c.g.fillStyle(foco ? COR.roxo : COR.lilasBorda, 1); c.g.fillRoundedRect(-CAMPO_W / 2, -CAMPO_H / 2, CAMPO_W, CAMPO_H, 20);
        c.g.fillStyle(foco ? 0xf2f0fd : 0xf1eff8, 1); c.g.fillRoundedRect(-CAMPO_W / 2 + 4, -CAMPO_H / 2 + 4, CAMPO_W - 8, CAMPO_H - 8, 17);
        const s = k === 'login' ? e.login.toLowerCase() : '●'.repeat(e.senha.length); // senha aparece como bolinhas
        c.t.setText(s + (foco ? '|' : ''));
      });
    }

    // Botão Entrar: confere o login no banco de dados (pode demorar um pouquinho: mostramos "Entrando...")
    async entrarNoJogo() {
      const e = this.estado;
      if (this.entrando) return;
      if (!e.login) return this.erro('Primeiro, digite o seu nome de usuário.');
      if (!e.senha) return this.erro('Agora digite a sua senha.');
      this.entrando = true;
      this.btEntrar.setTexto('Entrando...'); this.btEntrar.setAlpha(0.75);
      const r = await TS.DB.entrar(e.login, e.senha, { perfil: 'aluno' });
      this.entrando = false;
      if (!this.sys.isActive()) return;   // a criança saiu da tela enquanto esperava
      this.btEntrar.setTexto('Entrar'); this.btEntrar.setAlpha(1);
      if (r.erro) {
        const MSG = {
          gestao: 'Esta entrada é para alunos. Professores usam o botão Sou professor.',
          rede: 'Estou sem internet agora. Peça ajuda para o professor.',
          bloqueado: 'Muitas tentativas! Espere um pouquinho e tente de novo.',
          inativo: 'Seu acesso está desligado. Chame seu professor!',
          instalacao: 'O jogo ainda não está ligado ao banco de dados. Chame o professor.',
          chave: 'O jogo ainda não está ligado ao banco de dados. Chame o professor.',
        };
        return this.erro(MSG[r.erro]);
      }
      TS.Som.tocar('acerto');
      this.bibo.setExpr('comemorando');
      this.time.delayedCall(500, () => this.ir('BoasVindas'));
    }

    // Deu errado: os campos tremem, Lumi avisa e a senha é apagada
    erro(msg) {
      TS.Som.tocar('erro', 0.4);
      this.tweens.add({ targets: [this.campos.login, this.campos.senha], x: '+=14', yoyo: true, repeat: 3, duration: 60 });
      const t = msg || 'Hmm, não deu certo. Chame seu professor!';
      this.balao.setText(t);
      this.bibo.falar(t, { expr: 'preocupado' });
      this.estado.senha = '';
      this.atualizar();
    }
  }

  TS.CENAS.push(LoginAluno);
})();
