/* t18_relatorio.js — T18 Relatório de desempenho.
   O professor escolhe a turma (ou todas), o período, a habilidade e a fase, e vê:
   - os números gerais;
   - "Turmas e alunos": cada turma com o resumo dela, que abre e mostra os alunos daquela turma;
   - a mesma informação aluno por aluno, por fase ou por habilidade;
   - os gráficos de acerto e os itens com mais erro.
   Tudo pode ser baixado como planilha (CSV). */
window.TS = window.TS || {};
(function () {
  const K = TS.AdminKit; // ferramentas criadas em admin_base.js
  const { I, G, U, esc, $, $$, state, avatar, badge, nomeFase, minutos,
    toast, tabela, vazio, turmasVisiveis, alunosVisiveis, nomeTurma, linhaAluno, PAGINAS, ir, kpi } = K;

  const corTaxa = (t) => (t == null ? '#B4B7CC' : t < 0.5 ? '#D23B57' : t < 0.7 ? '#e0a526' : '#2E9A3E');
  const barraTaxa = (t, sub) => (t == null ? '<span class="sem-dados">sem partidas</span>'
    : `<div style="display:flex;gap:10px;align-items:center;justify-content:flex-end"><div class="barra-mini" style="width:84px"><i style="width:${t * 100}%;background:${corTaxa(t)}"></i></div><b>${U.pct(t)}</b></div>${sub ? `<small style="display:block;color:var(--ink-3);font-weight:600;margin-top:2px">${sub}</small>` : ''}`);
  const chipHab = (h) => (h ? `<span class="chip" style="background:${TS.C.HAB[h.k].cor}22" title="${U.pct(h.taxa)} de acerto">${esc(TS.C.HAB[h.k].nome)} · ${U.pct(h.taxa)}</span>` : '<span class="sem-dados">—</span>');

  /* Resumo de um conjunto de partidas: acertos, erros, tempo e a habilidade com menor acerto */
  function resumo(ss) {
    const ok = ss.reduce((s, x) => s + x.acertos, 0), err = ss.reduce((s, x) => s + x.erros, 0);
    const ph = TS.DB.acertoPorHabilidade(ss);
    const habs = Object.entries(ph).filter(([, v]) => v.tot >= 2).map(([k, v]) => ({ k, taxa: v.ok / v.tot })).sort((a, b) => a.taxa - b.taxa);
    return { sess: ss.length, ok, err, tot: ok + err, taxa: ok + err ? ok / (ok + err) : null, seg: ss.reduce((s, x) => s + x.duracaoSeg, 0), pior: habs[0] || null };
  }
  /* Atividades do professor enviadas para a turma do aluno: quantas ele já respondeu */
  function atividadesDoAluno(a, todas) {
    const ats = TS.DB.atividades.daTurma(a.turmaId);
    const fez = ats.filter((x) => TS.DB.progressoAtividade(a.id, x.id) || todas.some((s) => s.alunoId === a.id && s.atividadeId === x.id)).length;
    return { fez, total: ats.length };
  }
  const chipAtiv = (n) => (!n.total ? '<span class="sem-dados">—</span>'
    : `<span class="st ${n.fez === n.total ? 'feita' : n.fez ? 'atencao' : 'pendente'}">${n.fez} de ${n.total}</span>`);

  // ---------- T18 Relatório ----------
  PAGINAS.relatorios = (c) => {
    const f = PAGINAS.relatorios.filtros = PAGINAS.relatorios.filtros || { periodo: '30', fase: '', hab: '', agrupar: 'turma', visao: 'hab', ordem: 'nome' };
    const turmas = turmasVisiveis();
    c.innerHTML = `<div class="card" style="padding:20px 26px"><div class="rel-filtros">
        <label>Turma<select class="sel" data-turma><option value="todas">${K.isAdmin() ? 'Todas as turmas' : 'Todas as minhas turmas'}</option>${turmas.map((t) => `<option value="${t.id}">${esc(t.nome)}</option>`).join('')}</select></label>
        <label>Período<select class="sel" data-f="periodo"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="0">Todo o período</option></select></label>
        <label>Habilidade<select class="sel" data-f="hab"><option value="">Todas as habilidades</option>${Object.entries(TS.C.HAB).map(([k, h]) => `<option value="${k}">${h.nome}</option>`).join('')}</select></label>
        <label>Fase ou atividade<select class="sel" data-f="fase"><option value="">Todas as fases e atividades</option><optgroup label="Fases do mapa">${TS.C.FASES.map((x) => `<option value="${x.id}">${esc(nomeFase(x))}</option>`).join('')}</optgroup>${K.atividadesVisiveis().length ? `<optgroup label="Atividades do professor">${K.atividadesVisiveis().map((x) => `<option value="${x.id}">★ ${esc(x.titulo)}</option>`).join('')}</optgroup>` : ''}</select></label>
        <span class="sp"></span>
        <button class="btn btn-ghost" data-csv>${I('baixar')} Planilha (CSV)</button></div></div>
      <div class="pilha" data-rel></div>`;
    // A turma escolhida aqui é a mesma do seletor do topo da página
    const selT = $('[data-turma]', c); selT.value = state.turma;
    selT.onchange = () => { state.turma = selT.value; const topo = $('[data-seletor] select'); if (topo) topo.value = selT.value; ir('relatorios'); };
    $$('[data-f]', c).forEach((s) => { s.value = f[s.dataset.f]; s.onchange = () => { f[s.dataset.f] = s.value; desenhar(); }; });

    const alunos = alunosVisiveis();
    const filtrar = () => {
      const desde = +f.periodo ? new Date(Date.now() - +f.periodo * 864e5) : null;
      return TS.DB.sessoesDe(alunos.map((a) => a.id), desde).filter((s) => (!f.fase || (s.faseId || s.atividadeId) === f.fase) && (!f.hab || s.hab === f.hab));
    };
    let csv = () => [];

    function desenhar() {
      const ss = filtrar(); const el = $('[data-rel]', c);
      const todas = TS.DB.sessoesDe(alunos.map((a) => a.id));
      const geral = resumo(ss);
      const jogaram = new Set(ss.map((s) => s.alunoId)).size;
      // Uma linha por aluno (todos os alunos da turma, mesmo os que não jogaram no período)
      const porAluno = {}; ss.forEach((s) => (porAluno[s.alunoId] = porAluno[s.alunoId] || []).push(s));
      const linhas = alunos.map((a) => { const l = linhaAluno(a); const r = resumo(porAluno[a.id] || []); return { ...l, ...r, turmaId: a.turmaId, ativ: atividadesDoAluno(a, todas) }; });
      const ordenar = (ls) => ls.slice().sort({
        nome: (x, y) => x.nome.localeCompare(y.nome, 'pt-BR'),
        acerto: (x, y) => (x.taxa ?? 2) - (y.taxa ?? 2) || x.nome.localeCompare(y.nome, 'pt-BR'),
        situacao: (x, y) => x.stOrd - y.stOrd || x.nome.localeCompare(y.nome, 'pt-BR'),
      }[f.ordem]);
      const turmasDoRel = [...new Set(alunos.map((a) => a.turmaId || ''))].map((id) => ({ id, nome: id ? nomeTurma(id) : 'Sem turma', t: TS.DB.turmas.get(id) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      const umaTurma = turmasDoRel.length <= 1;
      if (umaTurma && f.agrupar === 'aluno') f.agrupar = 'turma';

      el.innerHTML = `
        <div class="grid g4">${kpi('users', '#1E88D0', alunos.length, umaTurma ? 'Alunos na turma' : 'Alunos', `${jogaram} jogaram no período`)}
          ${kpi('check', '#2E9A3E', geral.taxa == null ? '—' : U.pct(geral.taxa), 'Taxa de acerto', `${geral.ok} de ${geral.tot} itens`)}
          ${kpi('alerta', '#D23B57', geral.err, 'Erros registrados', `${geral.sess} partida(s)`)}${kpi('relogio', '#7A5AF0', minutos(geral.seg) + ' min', 'Tempo jogado', '')}</div>
        <div class="card"><div class="card-head"><div><h3>${{ turma: umaTurma ? `Alunos da turma ${esc(turmasDoRel[0] ? turmasDoRel[0].nome : '')}` : 'Turmas e alunos', aluno: 'Aluno por aluno', fase: 'Por fase e atividade', habilidade: 'Por habilidade' }[f.agrupar]}</h3>
            <p class="card-sub" style="margin:0">${{ turma: umaTurma ? 'Clique no nome do aluno para ver os erros e o histórico dele' : 'Clique numa turma para ver os alunos dela · clique no nome do aluno para ver os detalhes', aluno: 'Clique nos títulos das colunas para ordenar', fase: 'Clique nos títulos das colunas para ordenar', habilidade: 'Clique nos títulos das colunas para ordenar' }[f.agrupar]}</p></div>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
            ${f.agrupar === 'turma' ? `<select class="sel" data-ordem aria-label="Ordenar alunos"><option value="nome">Ordem: nome</option><option value="acerto">Ordem: menor acerto</option><option value="situacao">Ordem: situação</option></select>` : ''}
            <div class="alternador"><button data-agr="turma" class="${f.agrupar === 'turma' ? 'on' : ''}">${umaTurma ? 'Alunos' : 'Turmas e alunos'}</button>${umaTurma ? '' : `<button data-agr="aluno" class="${f.agrupar === 'aluno' ? 'on' : ''}">Todos os alunos</button>`}<button data-agr="fase" class="${f.agrupar === 'fase' ? 'on' : ''}">Fases</button><button data-agr="habilidade" class="${f.agrupar === 'habilidade' ? 'on' : ''}">Habilidades</button></div></div></div>
          <div data-tab></div></div>
        ${ss.length ? graficos(ss) : `<div class="card">${vazio('Sem partidas nesse período', 'Tente ampliar o período ou limpar os filtros de fase e habilidade.')}</div>`}`;
      const tab = $('[data-tab]', el);
      $$('[data-agr]', el).forEach((b) => (b.onclick = () => { f.agrupar = b.dataset.agr; desenhar(); }));
      $$('[data-v]', el).forEach((b) => (b.onclick = () => { f.visao = b.dataset.v; desenhar(); }));
      const so = $('[data-ordem]', el); if (so) { so.value = f.ordem; so.onchange = () => { f.ordem = so.value; desenhar(); }; }

      if (f.agrupar === 'turma') {
        // ---- Turmas que abrem e mostram os alunos ----
        const cab = '<tr><th>Turma / aluno</th><th>Situação</th><th class="num">Partidas</th><th class="num">% de acerto</th><th>Maior dificuldade</th><th title="Atividades do professor que o aluno já respondeu">Atividades</th><th class="num">Tempo</th></tr>';
        const linhaAl = (l) => `<tr class="al"><td><div class="nome-cel">${avatar(l.nome, 32)}<div><a data-aluno="${l.id}"><b>${esc(l.nome)}</b></a><small class="sub-nome">Fase ${esc(l.fase.mundo + '-' + l.fase.fase)} · ${esc(l.fase.nome)}</small></div></div></td>
          <td>${badge(l.st.cod, l.st.motivo)}</td><td class="num">${l.sess || '<span class="sem-dados">0</span>'}</td><td class="num">${barraTaxa(l.taxa, l.tot ? `${l.err} erro(s) em ${l.tot}` : '')}</td>
          <td>${chipHab(l.pior)}</td><td>${chipAtiv(l.ativ)}</td><td class="num">${l.sess ? minutos(l.seg) + ' min' : '—'}</td></tr>`;
        tab.innerHTML = `<div class="tabela-wrap"><table class="t grupos"><thead>${cab}</thead>${turmasDoRel.map((t) => {
          const ls = linhas.filter((l) => (l.turmaId || '') === t.id); const r = resumo(ss.filter((s) => ls.some((l) => l.id === s.alunoId)));
          const nDif = ls.filter((l) => l.st.cod === 'dificuldade').length, nAt = ls.filter((l) => l.st.cod === 'atencao').length;
          const at = ls.reduce((s, l) => ({ fez: s.fez + l.ativ.fez, total: s.total + l.ativ.total }), { fez: 0, total: 0 });
          const prof = t.t && t.t.professorId ? (TS.DB.users.get(t.t.professorId) || {}).nome : '';
          return `<tbody class="tgrupo${umaTurma ? ' aberto' : ''}" data-grupo="${esc(t.id)}">
            ${umaTurma ? '' : `<tr class="cab-turma" tabindex="0"><td><span class="seta-g">${I('baixo')}</span><b style="font-size:15.5px">${esc(t.nome)}</b><small class="sub-nome" style="padding-left:36px">${ls.length} aluno(s)${prof ? ' · ' + esc(prof) : ''}</small></td>
              <td>${nDif ? `<span class="st dificuldade">${nDif} com dificuldade</span> ` : ''}${nAt ? `<span class="st atencao">${nAt} em atenção</span>` : ''}${!nDif && !nAt ? '<span class="st ok">Turma em dia</span>' : ''}</td>
              <td class="num"><b>${r.sess}</b></td><td class="num">${barraTaxa(r.taxa, r.tot ? `${r.err} erro(s) em ${r.tot}` : '')}</td><td>${chipHab(r.pior)}</td><td>${chipAtiv(at)}</td><td class="num"><b>${minutos(r.seg)} min</b></td></tr>`}
            ${ordenar(ls).map(linhaAl).join('')}</tbody>`;
        }).join('')}</table></div>
          ${umaTurma ? '' : '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px"><button class="btn btn-ghost btn-sm" data-abrir="1">Abrir todas</button><button class="btn btn-ghost btn-sm" data-abrir="0">Fechar todas</button></div>'}`;
        $$('tr.cab-turma', tab).forEach((tr) => {
          const alternar = () => tr.parentElement.classList.toggle('aberto');
          tr.onclick = alternar; tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } };
        });
        $$('[data-abrir]', tab).forEach((b) => (b.onclick = () => $$('tbody.tgrupo', tab).forEach((g) => g.classList.toggle('aberto', b.dataset.abrir === '1'))));
        $$('[data-aluno]', tab).forEach((a) => (a.onclick = (e) => { e.stopPropagation(); ir('aluno', a.dataset.aluno); }));
        csv = () => [['Turma', 'Aluno', 'Situação', 'Fase atual', 'Partidas', 'Acertos', 'Erros', '% acerto', 'Maior dificuldade', 'Atividades respondidas', 'Tempo (min)'],
          ...turmasDoRel.flatMap((t) => {
            const ls = ordenar(linhas.filter((l) => (l.turmaId || '') === t.id)); const r = resumo(ss.filter((s) => ls.some((l) => l.id === s.alunoId)));
            return [[t.nome, 'TOTAL DA TURMA', '', '', r.sess, r.ok, r.err, r.taxa == null ? '' : Math.round(r.taxa * 100) + '%', r.pior ? TS.C.HAB[r.pior.k].nome : '', '', minutos(r.seg)],
              ...ls.map((l) => [t.nome, l.nome, l.st.rotulo, `${l.fase.mundo}-${l.fase.fase} ${l.fase.nome}`, l.sess, l.ok, l.err, l.taxa == null ? '' : Math.round(l.taxa * 100) + '%', l.pior ? TS.C.HAB[l.pior.k].nome : '', l.ativ.total ? `${l.ativ.fez} de ${l.ativ.total}` : '', minutos(l.seg)])];
          })];
      } else if (f.agrupar === 'aluno') {
        // ---- Todos os alunos numa tabela só (com a turma ao lado) ----
        tabela(tab, {
          ordem: { k: 'taxa', dir: 1 }, linhas: () => linhas, porPagina: 15,
          cols: [
            { k: 'nome', rot: 'Aluno', render: (l) => `<div class="nome-cel">${avatar(l.nome, 32)}<div><a data-aluno="${l.id}"><b>${esc(l.nome)}</b></a><small class="sub-nome">${esc(l.turma)}</small></div></div>` },
            { k: 'st', rot: 'Situação', valor: (l) => l.stOrd, render: (l) => badge(l.st.cod, l.st.motivo) },
            { k: 'sess', rot: 'Partidas', num: true },
            { k: 'taxa', rot: '% de acerto', num: true, valor: (l) => l.taxa ?? 2, render: (l) => barraTaxa(l.taxa, l.tot ? `${l.err} erro(s) em ${l.tot}` : '') },
            { k: 'pior', rot: 'Maior dificuldade', valor: (l) => (l.pior ? l.pior.taxa : 2), render: (l) => chipHab(l.pior) },
            { k: 'ativ', rot: 'Atividades', valor: (l) => (l.ativ.total ? l.ativ.fez / l.ativ.total : 2), render: (l) => chipAtiv(l.ativ) },
            { k: 'seg', rot: 'Tempo', num: true, render: (l) => (l.sess ? `${minutos(l.seg)} min` : '—') },
          ],
          vazio: '', aposRender: (t) => $$('[data-aluno]', t).forEach((a) => (a.onclick = () => ir('aluno', a.dataset.aluno))),
        });
        csv = () => [['Aluno', 'Turma', 'Situação', 'Partidas', 'Acertos', 'Erros', '% acerto', 'Maior dificuldade', 'Atividades respondidas', 'Tempo (min)'],
          ...linhas.map((l) => [l.nome, l.turma, l.st.rotulo, l.sess, l.ok, l.err, l.taxa == null ? '' : Math.round(l.taxa * 100) + '%', l.pior ? TS.C.HAB[l.pior.k].nome : '', l.ativ.total ? `${l.ativ.fez} de ${l.ativ.total}` : '', minutos(l.seg)])];
      } else {
        // ---- Por fase / por habilidade ----
        const chave = f.agrupar === 'fase' ? (s) => s.faseId || s.atividadeId : (s) => s.hab;
        const nome = f.agrupar === 'fase' ? (k) => K.origem(k).rot : (k) => (TS.C.HAB[k] || {}).nome || k;
        const g = {}; ss.forEach((s) => { const k = chave(s); const x = (g[k] = g[k] || { id: k, sess: 0, ok: 0, err: 0, seg: 0, alunos: new Set() }); x.sess++; x.ok += s.acertos; x.err += s.erros; x.seg += s.duracaoSeg; x.alunos.add(s.alunoId); });
        const piv = Object.values(g).map((x) => ({ ...x, nome: nome(x.id), taxa: x.ok + x.err ? x.ok / (x.ok + x.err) : null, nAlunos: x.alunos.size }));
        tabela(tab, {
          ordem: { k: 'taxa', dir: 1 }, linhas: () => piv, porPagina: 15,
          cols: [
            { k: 'nome', rot: f.agrupar === 'fase' ? 'Fase / atividade' : 'Habilidade', render: (l) => `<b>${esc(l.nome)}</b>` },
            { k: 'nAlunos', rot: 'Alunos', num: true }, { k: 'sess', rot: 'Partidas', num: true }, { k: 'ok', rot: 'Acertos', num: true }, { k: 'err', rot: 'Erros', num: true },
            { k: 'taxa', rot: '% de acerto', num: true, render: (l) => barraTaxa(l.taxa) },
            { k: 'seg', rot: 'Tempo', num: true, render: (l) => `${minutos(l.seg)} min` },
          ],
          vazio: `<p class="card-sub">Sem partidas nesse período.</p>`,
        });
        csv = () => [[f.agrupar === 'fase' ? 'Fase / atividade' : 'Habilidade', 'Alunos', 'Partidas', 'Acertos', 'Erros', '% acerto', 'Tempo (min)'],
          ...piv.map((l) => [l.nome, l.nAlunos, l.sess, l.ok, l.err, l.taxa == null ? '' : Math.round(l.taxa * 100) + '%', minutos(l.seg)])];
      }
    }

    /* Gráficos: acerto por habilidade (ou por fase) e os itens com mais erro */
    function graficos(ss) {
      const ph = TS.DB.acertoPorHabilidade(ss);
      const porFase = {}; ss.forEach((s) => { const k = s.faseId || s.atividadeId; const x = (porFase[k] = porFase[k] || { ok: 0, tot: 0 }); x.ok += s.acertos; x.tot += s.acertos + s.erros; });
      const barrasHab = Object.entries(TS.C.HAB).map(([k, h]) => ({ rot: h.nome, v: ph[k].tot ? ph[k].ok / ph[k].tot : 0, vazio: !ph[k].tot, cor: h.cor, sub: `${ph[k].tot} itens` }));
      const barrasFase = TS.C.FASES.filter((x) => porFase[x.id] && porFase[x.id].tot).map((x) => ({ rot: `${x.mundo}-${x.fase}`, v: porFase[x.id].ok / porFase[x.id].tot, cor: TS.C.HAB[x.hab].cor }))
        .concat(Object.keys(porFase).filter((k) => !TS.C.fase(k) && porFase[k].tot).map((k, i) => ({ rot: `★${i + 1}`, v: porFase[k].ok / porFase[k].tot, cor: K.origem(k).cor }))); // ★ = atividades do professor
      const itens = TS.DB.itensMaisErrados(ss, 8);
      const cardBarras = `<div class="card"><div class="card-head"><div><h3>Taxa de acerto por ${f.visao === 'hab' ? 'habilidade' : 'fase'}</h3><p class="card-sub" style="margin:0">Linha tracejada: meta de 70%${f.visao === 'fase' && barrasFase.some((b) => b.rot.startsWith('★')) ? ' · ★ = atividades do professor' : ''}</p></div>
          <div class="alternador"><button data-v="hab" class="${f.visao === 'hab' ? 'on' : ''}">Habilidade</button><button data-v="fase" class="${f.visao === 'fase' ? 'on' : ''}">Fase</button></div></div>
          ${G.barras(f.visao === 'hab' ? barrasHab : barrasFase, { pct: true, max: 1, meta: 0.7, h: 300 })}</div>`;
      const cardItens = `<div class="card"><h3>Itens com maior índice de erro</h3><p class="card-sub">Onde mais se erra (o número é a porcentagem de erro) — orienta a intervenção pedagógica</p>
          ${itens.length ? G.barrasH(itens.map((i) => ({ rot: i.rotulo, sub: `${i.erros} erro(s) em ${i.tot}${i.ouvidos && i.ouvidos.filter(Boolean).length ? ' · ouvimos: ' + i.ouvidos.filter(Boolean).join(', ') : ''} · ${K.origem(i.faseId).custom ? 'atividade do professor' : 'fase ' + K.origem(i.faseId).curto}`, v: i.taxaErro, cor: TS.C.HAB[i.hab].cor })), { max: 1 }) : '<p>Nenhum erro no período.</p>'}</div>`;
      return `${cardBarras}${cardItens}`; // um embaixo do outro, na largura toda: nada de letra miúda
    }

    desenhar();
    $('[data-csv]', c).onclick = () => baixarCSV(`relatorio-${f.agrupar}-${new Date().toISOString().slice(0, 10)}.csv`, csv());
    return { titulo: `Relatório de desempenho<small>${state.turma === 'todas' ? (K.isAdmin() ? 'Todas as turmas' : 'Todas as suas turmas') : esc(nomeTurma(state.turma))}</small>` };
  };
  function baixarCSV(nome, linhas) {
    const csv = String.fromCharCode(0xFEFF) + linhas.map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); toast('Planilha gerada.');
  }
})();
