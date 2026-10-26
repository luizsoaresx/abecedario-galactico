/* t29_desempenho.js — T29 Desempenho da turma: o que cada aluno acerta e erra, por habilidade, e onde a turma tem
   mais dificuldade. Serve para o professor decidir o que retomar em sala e quem precisa de ajuda individual.
   - Resumo das dificuldades: habilidades com menos acerto, quantos alunos estão abaixo de 60% e os itens mais errados,
     com uma sugestão de atividade para a sala.
   - Mapa de desempenho: uma linha por aluno, uma coluna por habilidade (verde, amarelo, vermelho). Clique no aluno para
     ver exatamente quais erros ele cometeu.
   - Acerto de cada aluno (gráfico de barras) e os itens que mais derrubam a turma. */
window.TS = window.TS || {};
(function () {
  const K = TS.AdminKit; // ferramentas criadas em admin_base.js
  const { I, G, U, esc, state, avatar, badge, vazio, alunosVisiveis, nomeTurma, linhaAluno, PAGINAS, ir, kpi } = K;

  const META = 0.7, BAIXO = 0.6;
  const corTaxa = (t) => (t == null ? '#C9CEDA' : t < 0.5 ? '#D23B57' : t < META ? '#E0A526' : '#2E9A3E');
  const classeTaxa = (t) => (t == null ? 'sem' : t < 0.5 ? 'ruim' : t < META ? 'medio' : 'bom');
  // Sugestão para a sala de aula, por habilidade
  const DICAS = {
    letra: 'Retome o alfabeto com letras móveis e jogos de caça-letras; ligue cada letra a uma figura que a turma conhece.',
    palavra: 'Fale frases curtas e bata uma palma para cada palavra; conte junto com a turma.',
    silaba: 'Separe nomes em sílabas com palmas e monte palavras com fichas de sílabas.',
    rima: 'Leia parlendas e cantigas destacando as palavras que terminam com o mesmo som; brinque de completar a rima.',
    aliteracao: 'Brinque de "o que começa com..." e com trava-línguas; agrupe figuras pelo som do começo.',
    fonema: 'Trabalhe o som de cada letra ("mmmm", "ssss") e ligue som, letra e figura.',
    leitura: 'Leia com a turma palavras curtas em fichas e cartazes; ligue cada palavra à figura e brinque de achar a palavra certa entre palavras parecidas (GATO, PATO, RATO).',
  };
  // Sessões e erros dos alunos, no período escolhido
  function dados(periodo) {
    const desde = +periodo ? new Date(Date.now() - +periodo * 864e5) : null;
    const alunos = alunosVisiveis();
    const ss = TS.DB.sessoesDe(alunos.map((a) => a.id), desde);
    const porAluno = {};
    alunos.forEach((a) => (porAluno[a.id] = { a, l: linhaAluno(a), ss: [], hab: {}, ok: 0, tot: 0, erros: [] }));
    ss.forEach((s) => {
      const x = porAluno[s.alunoId]; if (!x) return;
      x.ss.push(s);
      (s.itens || []).forEach((i) => {
        const h = (x.hab[s.hab] = x.hab[s.hab] || { ok: 0, tot: 0 });
        h.tot++; x.tot++; if (i.ok) { h.ok++; x.ok++; } else x.erros.push({ ...i, s });
      });
    });
    return { alunos: Object.values(porAluno), ss };
  }

  PAGINAS.desempenho = (c) => {
    const f = PAGINAS.desempenho.filtros = PAGINAS.desempenho.filtros || { periodo: '30' };
    const { alunos, ss } = dados(f.periodo);
    const turmaTxt = state.turma === 'todas' ? 'todas as suas turmas' : esc(nomeTurma(state.turma));
    const cab = `<div class="card" style="padding:16px 22px"><div class="toolbar" style="margin:0">
        <select class="sel" data-periodo aria-label="Período"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="0">Todo o período</option></select>
        <select class="sel" data-turma aria-label="Turma"><option value="todas">${K.isAdmin() ? 'Todas as turmas' : 'Todas as minhas turmas'}</option>${K.turmasVisiveis().map((t) => `<option value="${t.id}">${esc(t.nome)}</option>`).join('')}</select>
        <span class="card-sub" style="margin:0">${state.turma === 'todas' && K.turmasVisiveis().length > 1 ? 'Escolha uma turma para ver só os alunos dela.' : ''}</span></div></div>`;
    const titulo = { titulo: `Desempenho da turma<small>Acertos e erros de cada aluno · ${turmaTxt}</small>` };
    const ligar = () => {
      const sel = c.querySelector('[data-periodo]'); sel.value = f.periodo;
      sel.onchange = () => { f.periodo = sel.value; ir('desempenho'); };
      const st = c.querySelector('[data-turma]'); st.value = state.turma;
      st.onchange = () => { state.turma = st.value; const topo = document.querySelector('[data-seletor] select'); if (topo) topo.value = st.value; ir('desempenho'); };
      c.querySelectorAll('[data-hb]').forEach((e) => (e.onclick = () => ir('aluno', e.dataset.hb)));
      c.querySelectorAll('[data-aluno]').forEach((e) => (e.onclick = () => ir('aluno', e.dataset.aluno)));
    };
    if (!alunos.length) { c.innerHTML = cab + `<div class="card">${vazio('Nenhum aluno nesta turma', 'Cadastre alunos para acompanhar o desempenho.')}</div>`; ligar(); return titulo; }
    if (!ss.length) { c.innerHTML = cab + `<div class="card">${vazio('Ainda não há partidas neste período', 'Amplie o período ou espere os alunos jogarem.')}</div>`; ligar(); return titulo; }

    // ---------- Por habilidade (turma toda) ----------
    const habs = Object.entries(TS.C.HAB).map(([k, h]) => {
      const com = alunos.filter((x) => x.hab[k] && x.hab[k].tot);
      const ok = com.reduce((s, x) => s + x.hab[k].ok, 0), tot = com.reduce((s, x) => s + x.hab[k].tot, 0);
      const abaixo = com.filter((x) => x.hab[k].ok / x.hab[k].tot < BAIXO);
      return { k, h, taxa: tot ? ok / tot : null, tot, nAlunos: com.length, abaixo };
    });
    const comDados = habs.filter((x) => x.tot);
    const ordem = comDados.slice().sort((a, b) => a.taxa - b.taxa);
    const pior = ordem[0], melhor = ordem[ordem.length - 1];
    const dificeis = ordem.filter((x) => x.taxa < META).slice(0, 3);
    const itensTurma = TS.DB.itensMaisErrados(ss, 40);
    // quantos alunos diferentes erraram cada item e o que responderam
    const quem = {}; const resps = {};
    alunos.forEach((x) => x.erros.forEach((e) => {
      (quem[e.r] = quem[e.r] || new Set()).add(x.a.id);
      const r = e.resp || (e.ouvido ? `falou "${e.ouvido}"` : '');
      if (r) { const m = (resps[e.r] = resps[e.r] || {}); m[r] = (m[r] || 0) + 1; }
    }));
    const respComum = (rot) => Object.entries(resps[rot] || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([r]) => r);

    const geral = alunos.filter((x) => x.tot).map((x) => ({ ...x, taxa: x.ok / x.tot }));
    const media = geral.reduce((s, x) => s + x.ok, 0) / Math.max(1, geral.reduce((s, x) => s + x.tot, 0));
    const abaixoGeral = geral.filter((x) => x.taxa < BAIXO);

    // ---------- Resumo das dificuldades ----------
    const frase = pior && melhor && pior !== melhor
      ? `A turma vai melhor em <b>${melhor.h.nome}</b> (${U.pct(melhor.taxa)} de acerto) e tem mais dificuldade em <b>${pior.h.nome}</b> (${U.pct(pior.taxa)}).`
      : pior ? `Acerto em <b>${pior.h.nome}</b>: ${U.pct(pior.taxa)}.` : '';
    const cartoesDif = (dificeis.length ? dificeis : ordem.slice(0, 1)).map((d) => {
      const its = itensTurma.filter((i) => i.hab === d.k).slice(0, 3);
      return `<div class="dif-item" style="--cor:${d.h.cor}">
        <div class="dif-topo"><span class="chip" style="background:${d.h.cor}22;color:${d.h.cor}">${esc(d.h.nome)}</span><b class="dif-taxa" style="color:${corTaxa(d.taxa)}">${U.pct(d.taxa)}</b></div>
        <div class="barra-mini"><i style="width:${d.taxa * 100}%;background:${corTaxa(d.taxa)}"></i></div>
        <p><b>${d.abaixo.length} de ${d.nAlunos}</b> aluno(s) abaixo de 60%${d.abaixo.length ? `: ${d.abaixo.slice(0, 5).map((x) => `<a data-aluno="${x.a.id}">${esc(x.a.nome.split(' ')[0])}</a>`).join(', ')}${d.abaixo.length > 5 ? '…' : ''}` : ''}.</p>
        ${its.length ? `<p>Mais erram: ${its.map((i) => `<b>${esc(i.rotulo)}</b>`).join(', ')}.</p>` : ''}
        <p class="dif-dica">${I('alvo')}<span>${esc(DICAS[d.k] || '')}</span></p></div>`;
    }).join('');

    // ---------- Mapa de desempenho (aluno x habilidade) ----------
    const colHabs = comDados.map((x) => x.k);
    const linhas = alunos.slice().sort((a, b) => (a.tot ? a.ok / a.tot : 2) - (b.tot ? b.ok / b.tot : 2));
    const mapa = `<div class="tabela-wrap"><table class="t mapa-calor"><thead><tr><th>Aluno</th>${colHabs.map((k) => `<th class="num" style="color:${TS.C.HAB[k].cor}">${esc(TS.C.HAB[k].nome)}</th>`).join('')}<th class="num">Geral</th><th class="num">Erros</th><th>Situação</th></tr></thead>
      <tbody>${linhas.map((x) => {
        const g = x.tot ? x.ok / x.tot : null;
        return `<tr class="clicavel" data-aluno="${x.a.id}"><td><div class="nome-cel">${avatar(x.a.nome, 30)}<div><b>${esc(x.a.nome)}</b><small>${esc(x.l.turma)}</small></div></div></td>
          ${colHabs.map((k) => { const h = x.hab[k]; const t = h && h.tot ? h.ok / h.tot : null; return `<td class="num"><span class="calor ${classeTaxa(t)}" title="${h ? `${h.ok} de ${h.tot} certos` : 'ainda não jogou'}">${t == null ? '—' : U.pct(t)}</span></td>`; }).join('')}
          <td class="num"><b style="color:${corTaxa(g)}">${g == null ? '—' : U.pct(g)}</b></td><td class="num">${x.tot ? x.tot - x.ok : '—'}</td><td>${badge(x.l.st.cod, x.l.st.motivo)}</td></tr>`;
      }).join('')}</tbody></table></div>`;

    // ---------- Itens que mais derrubam a turma ----------
    const topItens = itensTurma.slice(0, 10);
    const tabItens = topItens.length ? `<div class="tabela-wrap"><table class="t"><thead><tr><th>Item</th><th>Habilidade</th><th class="num">Alunos que erraram</th><th class="num">Erros</th><th>O que responderam</th></tr></thead><tbody>
      ${topItens.map((i) => `<tr><td class="quebra"><b>${esc(i.rotulo)}</b><br><small style="color:var(--ink-3)">${esc(K.origem(i.faseId).rot)}</small></td><td><span class="chip" style="background:${TS.C.HAB[i.hab].cor}22">${esc(TS.C.HAB[i.hab].nome)}</span></td>
        <td class="num">${(quem[i.rotulo] || new Set()).size}</td><td class="num">${i.erros}/${i.tot}</td><td class="quebra">${respComum(i.rotulo).map(esc).join('; ') || '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p>Nenhum erro registrado no período.</p>';

    c.innerHTML = `${cab}
      <div class="grid g4">${kpi('users', '#7A5AF0', `${geral.length}/${alunos.length}`, 'Alunos que jogaram', 'no período')}${kpi('check', '#2E9A3E', U.pct(media), 'Acerto médio', `meta: ${U.pct(META)}`)}
        ${kpi('alerta', '#D23B57', abaixoGeral.length, 'Abaixo de 60%', 'precisam de reforço', abaixoGeral.length ? 'destaque' : '')}${kpi('alvo', pior ? pior.h.cor : '#7C7FA6', pior ? esc(pior.h.nome) : '—', 'Maior dificuldade', pior ? `${U.pct(pior.taxa)} de acerto` : '')}</div>
      <div class="card"><div class="card-head"><div><h3>Principais dificuldades da turma</h3><p class="card-sub" style="margin:0">Habilidades abaixo da meta de ${U.pct(META)}, quem precisa de reforço e o que fazer em sala</p></div></div>
        ${frase ? `<div class="insight" style="margin-bottom:22px">${I('info')}<div>${frase}</div></div>` : ''}
        <div class="dif-grade">${cartoesDif}</div></div>
      <div class="card"><div class="card-head"><div><h3>Mapa de desempenho por aluno</h3><p class="card-sub" style="margin:0">Acerto de cada aluno em cada habilidade. Clique no aluno para ver exatamente os erros dele.</p></div>
        <div class="legenda"><span><i style="background:#2E9A3E"></i>70% ou mais</span><span><i style="background:#E0A526"></i>50% a 69%</span><span><i style="background:#D23B57"></i>abaixo de 50%</span></div></div>
        ${mapa}</div>
      <div class="grid g2">
        <div class="card"><h3>Acerto de cada aluno</h3><p class="card-sub">Do menor para o maior · linha tracejada: meta de ${U.pct(META)} · clique num aluno para ver os erros dele</p>
          ${G.barrasH(geral.slice().sort((a, b) => a.taxa - b.taxa).map((x) => ({ id: x.a.id, rot: x.a.nome, sub: `${x.tot - x.ok} erro(s) em ${x.tot} · fase ${x.l.fase.mundo}-${x.l.fase.fase}`, v: x.taxa, cor: corTaxa(x.taxa) })), { max: 1, meta: 0.7 })}</div>
        <div class="card"><h3>Acerto da turma por habilidade</h3><p class="card-sub">Quantos alunos já jogaram cada habilidade</p>
          ${G.barrasH(habs.map((x) => ({ rot: x.h.nome, sub: x.tot ? `${x.nAlunos} aluno(s) · ${x.tot} itens` : 'ainda sem dados', v: x.taxa || 0, vazio: !x.tot, cor: x.h.cor })), { max: 1, meta: 0.7 })}</div>
      </div>
      <div class="card"><h3>Itens que mais derrubam a turma</h3><p class="card-sub">Palavras, letras e sons com mais erros — e o que os alunos responderam no lugar</p>${tabItens}</div>`;
    ligar();
    return titulo;
  };
})();
