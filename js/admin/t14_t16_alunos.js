/* t14_t16_alunos.js — T14 Lista de alunos, T15 Cadastro e edição, T16 Remover aluno. */
window.TS = window.TS || {};
(function () {
  const K = TS.AdminKit; // ferramentas criadas em admin_base.js
  const { I, G, U, esc, root, $, $$, FIGS, ST, state, avatar, corNome, iniciais, badge, figSrc, nomeFase, minutos,
    toast, modal, confirmar, tabela, vazio, isAdmin, turmasVisiveis, alunosVisiveis, nomeTurma, linhaAluno, PAGINAS, ir, kpi } = K;

  // ---------- T14 Lista de alunos ----------
  PAGINAS.alunos = (c) => {
    c.innerHTML = `<div class="card"><div class="toolbar">
        <label class="busca">${I('busca')}<input placeholder="Buscar por nome ou login" data-busca aria-label="Buscar aluno"></label>
        <select class="sel" data-fst aria-label="Filtrar por status"><option value="">Todos os status</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}">${v.rot}</option>`).join('')}</select>
        <span class="sp"></span>
        <button class="btn btn-primary" data-novo>${I('mais')} Cadastrar aluno</button></div><div data-tab></div></div>`;
    const busca = $('[data-busca]', c), fst = $('[data-fst]', c);
    const tb = tabela($('[data-tab]', c), {
      ordem: { k: 'st', dir: 1 },
      linhas: () => {
        const q = U.semAcento(busca.value);
        return alunosVisiveis().map(linhaAluno).filter((l) => (!q || U.semAcento(l.nome + ' ' + l.login).includes(q)) && (!fst.value || l.st.cod === fst.value));
      },
      cols: [
        { k: 'nome', rot: 'Nome', render: (l) => `<div class="nome-cel">${avatar(l.nome)}<div><b>${esc(l.nome)}</b><small class="login-peq">${esc(l.login)}${l.a.acessoCompleto ? ' <span class="chip chip-teste" title="Todas as fases liberadas">todas as fases</span>' : ''}</small></div></div>` },
        { k: 'turma', rot: 'Turma', nowrap: true },
        { k: 'fase', rot: 'Fase atual', valor: (l) => l.faseIdx, render: (l) => `<span class="chip" style="background:${TS.C.MUNDOS[l.fase.mundo - 1].cor}22;color:#2b2d42">${esc(nomeFase(l.fase))}</span>` },
        { k: 'ultimo', rot: 'Último acesso', nowrap: true, valor: (l) => l.ultimo || '', render: (l) => esc(U.relativo(l.ultimo)) },
        { k: 'st', rot: 'Status', valor: (l) => l.stOrd, render: (l) => badge(l.st.cod, l.st.motivo) },
        { k: 'acoes', rot: '', ord: false, render: (l) => `<div class="acoes"><button class="btn-icon" title="Ver desempenho" data-ver="${l.id}">${I('olho')}</button><button class="btn-icon" title="Editar" data-ed="${l.id}">${I('editar')}</button><button class="btn-icon perigo" title="Remover" data-rm="${l.id}">${I('lixo')}</button></div>` },
      ],
      onLinha: (id) => ir('aluno', id),
      vazio: vazio('Nenhum aluno cadastrado ainda', 'Cadastre os alunos da turma para que eles possam entrar no jogo.', `<button class="btn btn-primary" data-novo2>${I('mais')} Cadastrar aluno</button>`),
      aposRender: (el) => {
        $$('[data-ver]', el).forEach((b) => (b.onclick = () => ir('aluno', b.dataset.ver)));
        $$('[data-ed]', el).forEach((b) => (b.onclick = () => formAluno(TS.DB.users.get(b.dataset.ed), () => tb.render())));
        $$('[data-rm]', el).forEach((b) => (b.onclick = () => removerAluno(TS.DB.users.get(b.dataset.rm), () => tb.render())));
        const n2 = $('[data-novo2]', el); if (n2) n2.onclick = () => formAluno(null, () => tb.render());
        if (busca.value || fst.value) { const v = $('.vazio h4', el); if (v) { v.textContent = 'Nenhum aluno encontrado'; $('.vazio p', el).textContent = 'Tente outro nome ou limpe os filtros.'; } }
      },
    });
    busca.oninput = tb.render; fst.onchange = tb.render;
    $('[data-novo]', c).onclick = () => formAluno(null, () => tb.render());
    const n = alunosVisiveis().length;
    return { titulo: `Alunos<small>${n} aluno(s) · ${state.turma === 'todas' ? 'todas as turmas' : esc(nomeTurma(state.turma))}</small>` };
  };

  // ---------- T15 Cadastro e edição ----------
  const gerarSenha = () => { let s; do { s = String(1000 + Math.floor(Math.random() * 9000)); } while (/(\d)\1\1/.test(s) || '0123456789'.includes(s)); return s; };
  const sugerirLogin = (nome) => {
    const p = U.semAcento(nome).replace(/[^a-z ]/g, '').split(' ').filter(Boolean); if (!p.length) return '';
    let base = p[0] + (p.length > 1 ? '.' + p[p.length - 1][0] : ''); let l = base, i = 2;
    while (TS.DB.users.byLogin(l)) l = base + i++;
    return l;
  };
  function formAluno(aluno, depois) {
    const ed = !!aluno;
    const turmas = turmasVisiveis();
    modal({
      titulo: ed ? 'Editar aluno' : 'Cadastrar aluno', largo: true,
      corpo: `<form class="form-grid" novalidate>
        <div class="field full" data-f="nome"><label>Nome completo *</label><input name="nome" value="${esc(aluno?.nome || '')}" placeholder="Nome e sobrenome"><span class="msg"></span></div>
        <div class="field" data-f="login"><label>Login *</label><input name="login" value="${esc(aluno?.login || '')}" placeholder="ex.: joao.s"><span class="hint">Sem espaços. É o que a criança digita no jogo.</span><span class="msg"></span></div>
        <div class="field" data-f="senha"><label>${ed ? 'Nova senha (deixe vazio para manter)' : 'Senha *'}</label><div class="inp-btn"><input name="senha" value="${ed ? '' : gerarSenha()}" inputmode="numeric" autocomplete="off"><button type="button" class="btn btn-ghost" data-gerar title="Gerar senha simples">${I('chave')} Gerar</button></div><span class="msg"></span></div>
        <div class="field" data-f="turma"><label>Turma *</label><select name="turma"><option value="">Selecione…</option>${turmas.map((t) => `<option value="${t.id}" ${(aluno?.turmaId || (state.turma !== 'todas' ? state.turma : '')) === t.id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select><span class="msg"></span></div>
        <div class="field" data-f="email"><label>E-mail do responsável *</label><input name="email" type="email" value="${esc(aluno?.email || '')}" placeholder="familia@email.com"><span class="msg"></span></div>
        <label class="field full check-linha"><input type="checkbox" name="completo" ${aluno?.acessoCompleto ? 'checked' : ''}><span><b>Liberar todas as fases</b><span class="hint">Para demonstrações e testes. O aluno pode abrir qualquer fase do mapa, sem precisar completar as anteriores.</span></span></label>
      </form>`,
      rodape: `<button class="btn btn-ghost" data-fechar>Cancelar</button><button class="btn btn-primary" data-salvar>${ed ? 'Salvar alterações' : 'Cadastrar aluno'}</button>`,
      aoMontar: (m) => {
        const f = m.$('form');
        m.$('[data-gerar]').onclick = () => (f.senha.value = gerarSenha());
        if (!ed) f.nome.addEventListener('input', () => { if (!f.login.dataset.mexeu) f.login.value = sugerirLogin(f.nome.value); });
        f.login.addEventListener('input', () => (f.login.dataset.mexeu = 1));
        const marcar = (erros) => {
          $$('.field', m.el).forEach((x) => { x.classList.remove('erro'); const ms = x.querySelector('.msg'); if (ms) ms.textContent = ''; });
          Object.entries(erros).forEach(([k, msg]) => { const x = m.$(`[data-f=${k}]`); if (!x) return toast(msg, 'erro'); x.classList.add('erro'); x.querySelector('.msg').textContent = msg; });
        };
        m.$('[data-salvar]').onclick = async () => {
          const v = { nome: f.nome.value.trim(), login: f.login.value.trim().toLowerCase(), senha: f.senha.value.trim(), turmaId: f.turma.value, email: f.email.value.trim().toLowerCase(), acessoCompleto: f.completo.checked };
          const erros = {};
          if (v.nome.split(' ').filter(Boolean).length < 2) erros.nome = 'Informe nome e sobrenome.';
          if (!v.login) erros.login = 'Campo obrigatório.'; else if (!/^[a-z0-9._]{2,40}$/.test(v.login)) erros.login = 'Use apenas letras, números, ponto ou _.';
          else { const ex = TS.DB.users.byLogin(v.login); if (ex && ex.id !== aluno?.id) erros.login = 'Este login já existe. Escolha outro.'; }
          if (!ed && !v.senha) erros.senha = 'Campo obrigatório.'; else if (v.senha && v.senha.length < 4) erros.senha = 'Mínimo de 4 caracteres.';
          if (!v.turmaId) erros.turma = 'Selecione a turma.';
          if (!v.email) erros.email = 'Campo obrigatório.'; else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) erros.email = 'E-mail inválido.';
          marcar(erros);
          if (Object.keys(erros).length) return;
          const dados = { ...v, email: v.email || null };
          if (!v.senha) delete dados.senha;
          const bt = m.$('[data-salvar]'); const txtBt = bt.textContent; bt.disabled = true; bt.innerHTML = '<span class="spinner"></span> Salvando…';
          try {
            const u = ed ? await TS.DB.users.update(aluno.id, dados) : await TS.DB.users.create({ ...dados, perfil: 'aluno' });
            m.fechar(); depois && depois();
            if (!ed) credenciais(u, true, { senha: v.senha });
            else if (v.senha) credenciais(u, false, { senha: v.senha }, 'Dados de acesso atualizados');
            else toast('Dados do aluno atualizados.');
          } catch (e) {
            bt.disabled = false; bt.textContent = txtBt;
            marcar({ [{ login_existe: 'login', login: 'login', senha_curta: 'senha', turma: 'turma', nome: 'nome', email: 'email' }[e.codigo] || '_']: e.message });
          }
        };
      },
    });
  }
  /* Cartão com os dados de acesso para entregar à família.
     acesso: { senha } quando acabou de ser criado; senão, busca no banco (só professor da turma e administrador). */
  async function credenciais(u, novo, acesso, titulo) {
    const m = modal({
      titulo: titulo || (novo ? 'Aluno cadastrado!' : 'Dados de acesso'), largo: true,
      corpo: `${novo ? `<div class="alerta ok">${I('check')}<div><b>${esc(u.nome)}</b> já pode entrar no jogo.</div></div>` : ''}<div data-cartao><div class="sk" style="height:180px"></div></div>`,
      rodape: `<button class="btn btn-ghost" data-nova>${I('chave')} Gerar nova senha</button><button class="btn btn-ghost" data-copiar>${I('copiar')} Copiar</button><button class="btn btn-primary" data-fechar>Concluir</button>`,
    });
    const desenhar = (a) => {
      m.$('[data-cartao]').innerHTML = `<div class="cred"><div><div class="rot">Aluno</div><div style="font-weight:800">${esc(u.nome)}</div></div><div><div class="rot">Turma</div><div style="font-weight:800">${esc(nomeTurma(u.turmaId))}</div></div>
        <div><div class="rot">Login</div><div class="v">${esc(u.login)}</div></div><div><div class="rot">Senha</div><div class="v">${esc(a.senha || '—')}</div></div></div>`;
      const txtCred = `Abecedário Galáctico — acesso do aluno\nAluno: ${u.nome}\nTurma: ${nomeTurma(u.turmaId)}\nLogin: ${u.login}\nSenha: ${a.senha || '—'}`;
      m.$('[data-copiar]').onclick = () => { (navigator.clipboard ? navigator.clipboard.writeText(txtCred) : Promise.reject()).then(() => toast('Dados copiados.'), () => toast('Não foi possível copiar.', 'erro')); };
    };
    // Gerar nova senha (ex.: a criança esqueceu): troca a senha e mostra o cartão novo
    m.$('[data-nova]').onclick = () => confirmar({ titulo: 'Gerar nova senha', texto: `A senha de <b>${esc(u.nome)}</b> será trocada. A senha antiga deixa de funcionar.`, botao: 'Gerar nova senha', perigo: false,
      onOk: async () => {
        const novoAcesso = { senha: gerarSenha() };
        try { await TS.DB.users.update(u.id, novoAcesso); desenhar(novoAcesso); toast('Nova senha criada.'); } catch (e) { toast(e.message, 'erro'); }
      } });
    if (acesso) return desenhar(acesso);
    try { desenhar(await TS.DB.dadosAcesso(u.id)); }
    catch (e) { m.$('[data-cartao]').innerHTML = `<div class="alerta erro">${I('exclama')}<div>${esc(e.message)}</div></div>`; }
  }

  // ---------- T16 Remover aluno ----------
  function removerAluno(a, depois) {
    const n = TS.DB.raw.sessoes.filter((s) => s.alunoId === a.id).length;
    confirmar({ titulo: 'Remover aluno', texto: `Tem certeza que deseja remover <b>${esc(a.nome)}</b>?<br><br><b>Todo o histórico de desempenho será perdido</b> (${n} sessão(ões) de jogo). Esta ação não pode ser desfeita.`,
      botao: 'Remover aluno', onOk: async () => {
        try { await TS.DB.users.remove(a.id); toast('Aluno removido.'); depois && depois(); } catch (e) { toast(e.message, 'erro'); }
      } });
  }

  // Outras telas (T19) também usam estas funções
  K.formAluno = formAluno;
  K.credenciais = credenciais;
  K.removerAluno = removerAluno;
})();
