// Rotas de movimentação de estoque: entradas, saídas, devoluções, conferência e histórico
const { db, transacao } = require('../db');
const { rota, enviarJson, ErroHttp, texto, inteiro } = require('../http');
const { exigirLogin, exigirGerente } = require('../autenticacao');
const { movimentar } = require('../estoque');
const { avisar } = require('../tempo-real');

function produtoIdValido(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new ErroHttp(400, 'Selecione um produto.');
  return id;
}

// Entrada de mercadoria (produto, quantidade, data e funcionário são gravados)
rota('POST', '/api/movimentacoes/entrada', exigirLogin, (req, res, ctx) => {
  const produtoId = produtoIdValido(ctx.body.produto_id);
  const qtd = inteiro(ctx.body.quantidade, 'quantidade', { min: 1 });
  const obs = texto(ctx.body.observacao, 'observação', { max: 300 });
  const r = transacao(() =>
    movimentar({ produtoId, tipo: 'entrada', variacao: qtd, usuarioId: ctx.usuario.id, observacao: obs })
  );
  avisar('estoque', r);
  enviarJson(res, 201, r);
});

// Saída efetiva (venda/retirada): bloqueada se deixaria o saldo negativo
rota('POST', '/api/movimentacoes/saida', exigirLogin, (req, res, ctx) => {
  const produtoId = produtoIdValido(ctx.body.produto_id);
  const qtd = inteiro(ctx.body.quantidade, 'quantidade', { min: 1 });
  const obs = texto(ctx.body.observacao, 'observação', { max: 300 });
  const r = transacao(() =>
    movimentar({ produtoId, tipo: 'saida', variacao: -qtd, usuarioId: ctx.usuario.id, observacao: obs })
  );
  avisar('estoque', r);
  enviarJson(res, 201, r);
});

// Histórico de movimentações com filtros
rota('GET', '/api/movimentacoes', exigirLogin, (req, res, ctx) => {
  const q = ctx.query;
  const where = [];
  const params = [];
  if (q.produto_id) { where.push('m.produto_id = ?'); params.push(Number(q.produto_id)); }
  if (q.tipo) { where.push('m.tipo = ?'); params.push(String(q.tipo)); }
  if (q.usuario_id) { where.push('m.usuario_id = ?'); params.push(Number(q.usuario_id)); }
  if (q.de) { where.push('date(m.data) >= date(?)'); params.push(String(q.de)); }
  if (q.ate) { where.push('date(m.data) <= date(?)'); params.push(String(q.ate)); }
  const limite = Math.min(Number(q.limite) || 200, 1000);

  const movimentacoes = db.prepare(
    `SELECT m.id, m.tipo, m.quantidade, m.saldo_anterior, m.saldo_posterior, m.observacao, m.data,
            m.orcamento_id, p.id AS produto_id, p.nome AS produto, p.codigo, p.unidade, u.nome AS funcionario
       FROM movimentacoes m
       JOIN produtos p ON p.id = m.produto_id
       JOIN usuarios u ON u.id = m.usuario_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY m.id DESC LIMIT ${limite}`
  ).all(...params);
  enviarJson(res, 200, { movimentacoes });
});

// ---------------------------------------------------------------------
// Devoluções: registradas como "pendentes" e só voltam ao estoque após aprovação
// ---------------------------------------------------------------------
rota('POST', '/api/devolucoes', exigirLogin, (req, res, ctx) => {
  const produtoId = produtoIdValido(ctx.body.produto_id);
  const qtd = inteiro(ctx.body.quantidade, 'quantidade', { min: 1 });
  const motivo = texto(ctx.body.motivo, 'motivo', { obrigatorio: true, max: 300 });
  if (!db.prepare('SELECT 1 FROM produtos WHERE id = ?').get(produtoId)) {
    throw new ErroHttp(404, 'Produto não encontrado.');
  }
  const r = db.prepare('INSERT INTO devolucoes (produto_id, quantidade, motivo, registrado_por) VALUES (?, ?, ?, ?)')
    .run(produtoId, qtd, motivo, ctx.usuario.id);
  avisar('devolucao', {});
  enviarJson(res, 201, { id: Number(r.lastInsertRowid) });
});

rota('GET', '/api/devolucoes', exigirLogin, (req, res, ctx) => {
  const params = [];
  let where = '';
  if (ctx.query.status) { where = 'WHERE d.status = ?'; params.push(String(ctx.query.status)); }
  const devolucoes = db.prepare(
    `SELECT d.id, d.quantidade, d.motivo, d.status, d.data, d.data_avaliacao, d.parecer,
            p.id AS produto_id, p.nome AS produto, p.codigo, p.unidade,
            ur.nome AS registrado_por, ua.nome AS avaliado_por
       FROM devolucoes d
       JOIN produtos p ON p.id = d.produto_id
       JOIN usuarios ur ON ur.id = d.registrado_por
       LEFT JOIN usuarios ua ON ua.id = d.avaliado_por
      ${where}
      ORDER BY (d.status = 'pendente') DESC, d.id DESC LIMIT 300`
  ).all(...params);
  enviarJson(res, 200, { devolucoes });
});

// Confirmação da condição da mercadoria (somente gerente)
rota('POST', '/api/devolucoes/:id/avaliar', exigirGerente, (req, res, ctx) => {
  const id = Number(ctx.params.id);
  const aprovar = ctx.body.aprovar === true;
  const parecer = texto(ctx.body.parecer, 'parecer', { obrigatorio: !aprovar, max: 300 });

  const r = transacao(() => {
    const d = db.prepare('SELECT * FROM devolucoes WHERE id = ?').get(id);
    if (!d) throw new ErroHttp(404, 'Devolução não encontrada.');
    if (d.status !== 'pendente') throw new ErroHttp(409, 'Esta devolução já foi avaliada.');

    db.prepare(
      `UPDATE devolucoes SET status = ?, avaliado_por = ?, data_avaliacao = datetime('now', 'localtime'), parecer = ?
        WHERE id = ?`
    ).run(aprovar ? 'aprovada' : 'reprovada', ctx.usuario.id, parecer || null, id);

    if (!aprovar) return null;
    return movimentar({
      produtoId: d.produto_id, tipo: 'devolucao', variacao: d.quantidade, usuarioId: ctx.usuario.id,
      observacao: `Devolução #${id}: ${d.motivo}${parecer ? ' — ' + parecer : ''}`, devolucaoId: id,
    });
  });

  if (r) avisar('estoque', r);
  avisar('devolucao', {});
  enviarJson(res, 200, { ok: true, movimentacao: r });
});

// ---------------------------------------------------------------------
// Conferência de estoque (físico x sistema) — somente gerente
// Recebe uma lista de itens contados; cada divergência vira um "ajuste"
// com quantidade anterior, quantidade corrigida e justificativa.
// ---------------------------------------------------------------------
rota('POST', '/api/conferencia', exigirGerente, (req, res, ctx) => {
  const itens = Array.isArray(ctx.body.itens) ? ctx.body.itens : [];
  if (itens.length === 0) throw new ErroHttp(400, 'Informe a quantidade contada de pelo menos um produto.');
  if (itens.length > 2000) throw new ErroHttp(400, 'Itens demais em uma única conferência.');

  const resultado = transacao(() => {
    const ajustes = [];
    let conferidos = 0;
    for (const item of itens) {
      const produtoId = produtoIdValido(item.produto_id);
      const contado = inteiro(item.quantidade_contada, 'quantidade contada');
      const p = db.prepare('SELECT nome, quantidade FROM produtos WHERE id = ?').get(produtoId);
      if (!p) throw new ErroHttp(404, `Produto ${produtoId} não encontrado.`);
      conferidos++;
      const diferenca = contado - p.quantidade;
      if (diferenca === 0) continue;
      const justificativa = texto(item.justificativa, `justificativa de "${p.nome}"`, { obrigatorio: true, max: 300 });
      ajustes.push(movimentar({
        produtoId, tipo: 'ajuste', variacao: diferenca, usuarioId: ctx.usuario.id,
        observacao: `Conferência: ${justificativa}`,
      }));
    }
    return { conferidos, ajustes };
  });

  if (resultado.ajustes.length) avisar('estoque', {});
  enviarJson(res, 200, resultado);
});

// ---------------------------------------------------------------------
// Resumo para a tela inicial do painel
// ---------------------------------------------------------------------
rota('GET', '/api/resumo', exigirLogin, (req, res) => {
  const totais = db.prepare(
    `SELECT COUNT(*) AS produtos,
            SUM(quantidade = 0) AS esgotados,
            SUM(quantidade > 0 AND quantidade <= estoque_minimo) AS estoque_baixo,
            SUM(quantidade * preco_centavos) AS valor_estoque_centavos
       FROM produtos WHERE ativo = 1`
  ).get();
  const devolucoesPendentes = db.prepare("SELECT COUNT(*) AS n FROM devolucoes WHERE status = 'pendente'").get().n;
  const orcamentosValidos = db.prepare(
    "SELECT COUNT(*) AS n FROM orcamentos WHERE status = 'emitido' AND data_validade >= date('now', 'localtime')"
  ).get().n;
  const movHoje = db.prepare("SELECT COUNT(*) AS n FROM movimentacoes WHERE date(data) = date('now', 'localtime')").get().n;
  const alertas = db.prepare(
    `SELECT id, codigo, nome, quantidade, estoque_minimo, unidade FROM produtos
      WHERE ativo = 1 AND quantidade <= estoque_minimo ORDER BY quantidade, nome LIMIT 15`
  ).all();
  const ultimas = db.prepare(
    `SELECT m.tipo, m.quantidade, m.saldo_anterior, m.saldo_posterior, m.data, p.nome AS produto, p.unidade, u.nome AS funcionario
       FROM movimentacoes m JOIN produtos p ON p.id = m.produto_id JOIN usuarios u ON u.id = m.usuario_id
      ORDER BY m.id DESC LIMIT 8`
  ).all();
  enviarJson(res, 200, {
    totais: { ...totais, devolucoes_pendentes: devolucoesPendentes, orcamentos_validos: orcamentosValidos,
      movimentacoes_hoje: movHoje },
    alertas,
    ultimas,
  });
});
