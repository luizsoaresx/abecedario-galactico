/* t19_aluno.js — T19 Desempenho individual de um aluno. */
window.TS = window.TS || {};
(function () {
  const K = TS.AdminKit; // ferramentas criadas em admin_base.js
  const { I, G, U, esc, root, $, $$, FIGS, ST, state, avatar, corNome, iniciais, badge, figSrc, nomeFase, minutos,
    toast, modal, confirmar, tabela, vazio, isAdmin, turmasVisiveis, alunosVisiveis, nomeTurma, linhaAluno, PAGINAS, ir, kpi } = K;

  // O que a criança respondeu no lugar (gravado pelo jogo em cada erro)
  const oQueFez = (i) => i.resp || (i.ouvido != null ? (i.ouvido ? `falou "${i.ouvido}"` : 'não foi entendido / adulto marcou "ainda não"') : '—');
  // Uma sessão aberta: cada rodada, certa ou errada
  function abrirSessao(s) {
    if (!s) return;
    const its = s.itens || [];
    K.modal({
      titulo: `${K.origem(s.faseId || s.atividadeId).rot}`, largo: true,
      corpo: `<p class="card-sub" style="margin:0 0 18px">${esc(U.fmtDataHora(s.fim))} · ${s.acertos} acerto(s) e ${s.erros} erro(s) · ${'★'.repeat(s.estrelas) || 'sem estrelas'}</p>
        <div class="tabela-wrap"><table class="t"><thead><tr><th></th><th>Item</th><th>O que a criança fez</th></tr></thead><tbody>
        ${its.map((i) => `<tr><td>${i.ok ? '<span class="st ok">✓ certo</span>' : '<span class="st dificuldade">✗ errou</span>'}</td><td class="quebra"><b>${esc(i.r)}</b></td><td class="quebra">${i.ok ? (i.ouvido ? `falou "${esc(i.ouvido)}"` : '—') : esc(oQueFez(i))}</td></tr>`).join('')}
        </tbody></table></div>`,
      rodape: '<button class="btn btn-primary" data-fechar>Fechar</button>',
    });
  }

  /* Atividades que o professor mandou para a turma do aluno: respondeu ou ainda não (com estrelas, acerto e data). */
  function cartaoAtividades(a, ss) {
    const ats = TS.DB.atividades.daTurma(a.turmaId);
    if (!ats.length) return '';
    const feitas = ats.filter((x) => TS.DB.progressoAtividade(a.id, x.id) || ss.some((s) => s.atividadeId === x.id));
    return `<div class="card"><h3>Atividades do professor</h3><p class="card-sub">Respondeu <b>${feitas.length} de ${ats.length}</b> atividade(s) enviadas para a turma</p>
      <div class="lista-ativ">${ats.map((x) => {
        const p = TS.DB.progressoAtividade(a.id, x.id); const sx = ss.filter((s) => s.atividadeId === x.id);
        const ult = (p && p.ultimaVez) || (sx.length ? sx[sx.length - 1].fim : null);
        const fez = !!(p || sx.length);
        const estrelas = p ? p.estrelas : Math.max(0, ...sx.map((s) => s.estrelas || 0));
        const acc = p ? p.melhorAcc : sx.length ? Math.max(...sx.map((s) => s.acc || 0)) : null;
        const tent = p ? p.tentativas : sx.length;
        return `<div class="la" data-ativ="${x.id}"><div class="la-info"><b>${esc(x.titulo)}</b>
            <small>${esc(TS.ATV.MODELOS[x.modelo].nome)}${fez ? ` · ${tent} tentativa(s) · melhor acerto ${U.pct(acc)}${ult ? ` · ${esc(U.relativo(ult))}` : ''}` : ` · enviada ${esc(U.relativo(x.publicadaEm || x.criadoEm))}`}</small></div>
          <div class="la-dir">${fez ? `<span class="st feita">${I('check')}Respondeu</span><span class="estrelas-mini">${'★'.repeat(estrelas)}<i>${'★'.repeat(3 - estrelas)}</i></span>` : `<span class="st pendente">${I('relogio')}Ainda não respondeu</span>`}</div></div>`;
      }).join('')}</div></div>`;
  }

  // ---------- T19 Desempenho individual ----------
  PAGINAS.aluno = (c, id) => {
    const a = TS.DB.users.get(id);
    if (!a) { c.innerHTML = `<div class="card">${vazio('Aluno não encontrado', 'Ele pode ter sido removido.')}</div>`; return { titulo: 'Aluno' }; }
    const l = linhaAluno(a);
    const ss = TS.DB.raw.sessoes.filter((s) => s.alunoId === id).sort((x, y) => x.fim.localeCompare(y.fim));
    const ph = TS.DB.acertoPorHabilidade(ss);
    const ult = ss.slice(-20);
    const itens = TS.DB.itensMaisErrados(ss, 8);
    const habs = Object.entries(ph).filter(([, v]) => v.tot).map(([k, v]) => ({ k, taxa: v.ok / v.tot })).sort((x, y) => x.taxa - y.taxa);
    const pior = habs[0];
    const totT = ss.reduce((s, x) => s + x.duracaoSeg, 0);
    const piorItens = pior ? itens.filter((i) => i.hab === pior.k).slice(0, 3) : [];
    // Todos os erros, um por um (do mais recente para o mais antigo)
    const erros = [];
    ss.forEach((s) => (s.itens || []).forEach((i) => { if (!i.ok) erros.push({ ...i, s }); }));
    erros.sort((x, y) => String(y.s.fim).localeCompare(String(x.s.fim)));
    c.innerHTML = `
      <div class="card"><div class="perfil-h">${avatar(a.nome)}<div style="flex:1"><h2>${esc(a.nome)}</h2>
        <div class="meta"><span>${I('escola')} ${esc(l.turma)}</span><span>${I('trilha')} Fase atual: <b>${esc(nomeFase(l.fase))}</b></span><span>${I('relogio')} Último acesso: <b>${esc(U.relativo(l.ultimo))}</b></span><span>${I('user')} Login: <code>${esc(a.login)}</code></span></div></div>
        ${badge(l.st.cod, l.st.motivo)}
        <div class="no-print" style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" data-cred>${I('chave')} Dados de acesso</button><button class="btn btn-ghost btn-sm" data-ed>${I('editar')} Editar</button></div></div>
        ${l.st.cod !== 'ok' && l.st.cod !== 'novo' ? `<div class="alerta ${l.st.cod === 'dificuldade' ? 'erro' : 'info'}" style="margin:16px 0 0">${I('exclama')}<div>${esc(l.st.motivo)}.</div></div>` : ''}
      </div>
      ${ss.length ? `
      <div class="grid g4">${kpi('ativo', '#1E88D0', ss.length, 'Sessões jogadas', '')}${kpi('check', '#2E9A3E', U.pct(ss.reduce((s, x) => s + x.acertos, 0) / Math.max(1, ss.reduce((s, x) => s + x.acertos + x.erros, 0))), 'Acerto geral', '')}
        ${kpi('estrela', '#ffc93c', TS.DB.estrelasTotal(id), 'Estrelas', `${Object.values(TS.DB.progresso(id).fases).filter((x) => x.concluida).length} fase(s) concluída(s)`)}${kpi('relogio', '#7A5AF0', minutos(totT) + ' min', 'Tempo jogado', '')}</div>
      ${pior ? `<div class="insight">${I('alvo')}<div>Maior dificuldade em <b>${TS.C.HAB[pior.k].nome}</b> (${U.pct(pior.taxa)} de acerto).${piorItens.length ? ` Itens que mais erra: <b>${piorItens.map((i) => esc(i.rotulo)).join('</b>, <b>')}</b>.` : ''}${habs.length > 1 ? ` Vai melhor em <b>${TS.C.HAB[habs[habs.length - 1].k].nome}</b> (${U.pct(habs[habs.length - 1].taxa)}).` : ''}</div></div>` : ''}
      <div class="grid g2">
        <div class="card"><h3>Evolução de acertos e erros</h3><p class="card-sub">Últimas ${ult.length} sessões</p>
          ${G.linhas([{ nome: 'Acertos', cor: '#2E9A3E', area: true, pontos: ult.map((s) => ({ y: s.acertos })) }, { nome: 'Erros', cor: '#E8731A', pontos: ult.map((s) => ({ y: s.erros })) }], ult.map((s) => new Date(s.fim).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })), { w: 480, h: 270 })}
          <div class="legenda" style="margin-top:6px"><span><i style="background:#2E9A3E"></i>Acertos</span><span><i style="background:#E8731A"></i>Erros</span></div></div>
        <div class="card"><h3>Por habilidade</h3><p class="card-sub">Taxa de acerto em cada habilidade · linha tracejada: meta de 70%</p>
          ${G.barrasH(Object.entries(TS.C.HAB).map(([k, h]) => ({ rot: h.nome, sub: ph[k].tot ? `${ph[k].ok} de ${ph[k].tot} itens certos` : 'ainda não jogou', v: ph[k].tot ? ph[k].ok / ph[k].tot : 0, vazio: !ph[k].tot, cor: h.cor })), { max: 1, meta: 0.7 })}</div>
      </div>
      <div class="card"><div class="card-head"><div><h3>Erros cometidos</h3><p class="card-sub" style="margin:0">Cada erro do aluno, do mais recente para o mais antigo, com o que ele respondeu no lugar</p></div>
        <select class="sel no-print" data-filtro-hab aria-label="Habilidade"><option value="">Todas as habilidades</option>${Object.entries(TS.C.HAB).filter(([k]) => erros.some((e) => e.s.hab === k)).map(([k, h]) => `<option value="${k}">${h.nome} (${erros.filter((e) => e.s.hab === k).length})</option>`).join('')}</select></div>
        <div data-erros></div></div>
      ${(() => {
        const cardItens = `<div class="card"><h3>Itens que mais erra</h3><p class="card-sub">Agrupados: quantas vezes errou cada um</p>
          ${itens.length ? `<div class="tabela-wrap"><table class="t"><thead><tr><th>Item</th><th>Habilidade</th><th class="num">Erros</th><th class="num">% erro</th></tr></thead><tbody>${itens.map((i) => `<tr><td><b>${esc(i.rotulo)}</b></td><td><span class="chip" style="background:${TS.C.HAB[i.hab].cor}22">${TS.C.HAB[i.hab].nome}</span></td><td class="num">${i.erros}/${i.tot}</td><td class="num">${U.pct(i.taxaErro)}</td></tr>`).join('')}</tbody></table></div>` : '<p>Nenhum erro registrado.</p>'}</div>`;
        const cardAtiv = cartaoAtividades(a, ss);
        return cardAtiv ? `<div class="grid g2">${cardItens}${cardAtiv}</div>` : cardItens;
      })()}
      <div class="card"><div class="card-head"><div><h3>Histórico de sessões</h3><p class="card-sub" style="margin:0">${ss.length} sessão(ões) no total · clique numa sessão para ver cada resposta</p></div></div><div data-hist></div></div>` : `<div class="card">${vazio('Este aluno ainda não jogou', 'Quando ele jogar a primeira fase, o desempenho aparece aqui. Entregue os dados de acesso à família.')}</div>`}`;
    if (ss.length) tabela($('[data-hist]', c), {
      ordem: { k: 'fim', dir: -1 }, linhas: () => ss, porPagina: 10,
      cols: [{ k: 'fim', rot: 'Data', nowrap: true, render: (s) => esc(U.fmtDataHora(s.fim)) },
        { k: 'faseId', rot: 'Fase / atividade', valor: (s) => (TS.C.fase(s.faseId) || { idx: 98 }).idx, render: (s) => `<b>${esc(K.origem(s.faseId || s.atividadeId).rot)}</b>` },
        { k: 'hab', rot: 'Habilidade', render: (s) => (TS.C.HAB[s.hab] ? `<span class="chip" style="background:${TS.C.HAB[s.hab].cor}22">${esc(TS.C.HAB[s.hab].nome)}</span>` : '—') },
        { k: 'acertos', rot: 'Acertos', num: true }, { k: 'erros', rot: 'Erros', num: true },
        { k: 'estrelas', rot: 'Estrelas', num: true, nowrap: true, render: (s) => `<span class="estrelas-mini">${'★'.repeat(s.estrelas || 0)}<i>${'★'.repeat(3 - (s.estrelas || 0))}</i></span>` },
        { k: 'duracaoSeg', rot: 'Tempo', num: true, nowrap: true, render: (s) => `${minutos(s.duracaoSeg) || '<1'} min` },
        { k: 'ver', rot: '', ord: false, nowrap: true, render: () => `<span class="link">${I('olho')} Ver respostas</span>` }],
      onLinha: (sid) => abrirSessao(ss.find((x) => String(x.id) === String(sid))),
      vazio: '',
    });
    // Lista de erros (com filtro por habilidade), 10 por página
    if (ss.length) {
      const fh = $('[data-filtro-hab]', c);
      erros.forEach((e, i) => (e.id = 'e' + i));
      const tErros = tabela($('[data-erros]', c), {
        ordem: { k: 'data', dir: -1 }, porPagina: 10, linhas: () => erros.filter((e) => !fh.value || e.s.hab === fh.value),
        cols: [
          { k: 'data', rot: 'Data', nowrap: true, valor: (e) => String(e.s.fim), render: (e) => esc(U.fmtDataHora(e.s.fim)) },
          { k: 'fase', rot: 'Fase / atividade', valor: (e) => (TS.C.fase(e.s.faseId) || { idx: 98 }).idx, render: (e) => esc(K.origem(e.s.faseId || e.s.atividadeId).curto) },
          { k: 'hab', rot: 'Habilidade', valor: (e) => e.s.hab, render: (e) => `<span class="chip" style="background:${TS.C.HAB[e.s.hab].cor}22">${esc(TS.C.HAB[e.s.hab].nome)}</span>` },
          { k: 'r', rot: 'Item', quebra: true, render: (e) => `<b>${esc(e.r)}</b>` },
          { k: 'resp', rot: 'O que a criança fez', quebra: true, ord: false, render: (e) => esc(oQueFez(e)) },
        ],
        vazio: '<p class="card-sub">Nenhum erro registrado.</p>',
      });
      fh.onchange = () => tErros.render();
    }
    $$('[data-ativ]', c).forEach((el) => (el.onclick = () => ir('resultadoAtividade', el.dataset.ativ)));
    $('[data-cred]', c).onclick = () => K.credenciais(a, false);
    $('[data-ed]', c).onclick = () => K.formAluno(a, () => ir('aluno', id));
    return { titulo: `Desempenho individual` };
  };
})();
