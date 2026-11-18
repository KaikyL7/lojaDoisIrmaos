// Rotas de movimentação de estoque: entradas, saídas, devoluções, conferência, histórico e resumo
const express = require('express');
const { consultar, consultarUm, transacao } = require('../db');
const { ErroHttp, texto, inteiro, id } = require('../erros');
const { exigirLogin, exigirGerente } = require('../autenticacao');
const { movimentar } = require('../estoque');
const { avisar } = require('../tempo-real');

const rotas = express.Router();
const TIPOS = ['entrada', 'saida', 'devolucao', 'ajuste'];
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Entrada (mercadoria recebida) e saída (venda/retirada): produto, quantidade, data e funcionário
for (const tipo of ['entrada', 'saida']) {
  rotas.post(`/movimentacoes/${tipo}`, exigirLogin, async (req, res) => {
    const produtoId = id(req.body.produto_id, 'Produto');
    const qtd = inteiro(req.body.quantidade, 'quantidade', { min: 1 });
    const obs = texto(req.body.observacao, 'observação', { max: 300 });
    const r = await transacao((cliente) =>
      movimentar(cliente, {
        produtoId, tipo, variacao: tipo === 'entrada' ? qtd : -qtd, usuarioId: req.usuario.id, observacao: obs,
      })
    );
    avisar('estoque', r);
    res.status(201).json(r);
  });
}

// Histórico de movimentações com filtros
rotas.get('/movimentacoes', exigirLogin, async (req, res) => {
  const q = req.query;
  const where = [];
  const params = [];
  const filtro = (sql, valor) => { params.push(valor); where.push(sql.replace('?', `$${params.length}`)); };
  if (q.produto_id) filtro('m.produto_id = ?', id(q.produto_id, 'Produto'));
  if (q.tipo && TIPOS.includes(q.tipo)) filtro('m.tipo = ?', q.tipo);
  if (q.usuario_id) filtro('m.usuario_id = ?', id(q.usuario_id, 'Funcionário'));
  if (q.de && DATA_ISO.test(q.de)) filtro('m.data::date >= ?::date', q.de);
  if (q.ate && DATA_ISO.test(q.ate)) filtro('m.data::date <= ?::date', q.ate);
  params.push(Math.min(Number(q.limite) || 200, 1000));

  const movimentacoes = await consultar(
    `SELECT m.id, m.tipo, m.quantidade, m.saldo_anterior, m.saldo_posterior, m.observacao, m.data,
            m.orcamento_id, p.id AS produto_id, p.nome AS produto, p.codigo, p.unidade, u.nome AS funcionario
       FROM movimentacoes m
       JOIN produtos p ON p.id = m.produto_id
       JOIN usuarios u ON u.id = m.usuario_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY m.id DESC LIMIT $${params.length}`,
    params
  );
  res.json({ movimentacoes });
});

// ---------------------------------------------------------------------
// Devoluções: registradas como "pendentes" e só voltam ao estoque após aprovação
// ---------------------------------------------------------------------
rotas.post('/devolucoes', exigirLogin, async (req, res) => {
  const produtoId = id(req.body.produto_id, 'Produto');
  const qtd = inteiro(req.body.quantidade, 'quantidade', { min: 1 });
  const motivo = texto(req.body.motivo, 'motivo', { obrigatorio: true, max: 300 });
  if (!(await consultarUm('SELECT 1 FROM produtos WHERE id = $1', [produtoId]))) {
    throw new ErroHttp(404, 'Produto não encontrado.');
  }
  const d = await consultarUm(
    'INSERT INTO devolucoes (produto_id, quantidade, motivo, registrado_por) VALUES ($1, $2, $3, $4) RETURNING id',
    [produtoId, qtd, motivo, req.usuario.id]
  );
  avisar('devolucao', {});
  res.status(201).json({ id: d.id });
});

rotas.get('/devolucoes', exigirLogin, async (req, res) => {
  const status = ['pendente', 'aprovada', 'reprovada'].includes(req.query.status) ? req.query.status : null;
  const devolucoes = await consultar(
    `SELECT d.id, d.quantidade, d.motivo, d.status, d.data, d.data_avaliacao, d.parecer,
            p.id AS produto_id, p.nome AS produto, p.codigo, p.unidade,
            ur.nome AS registrado_por, ua.nome AS avaliado_por
       FROM devolucoes d
       JOIN produtos p ON p.id = d.produto_id
       JOIN usuarios ur ON ur.id = d.registrado_por
       LEFT JOIN usuarios ua ON ua.id = d.avaliado_por
      WHERE ($1::text IS NULL OR d.status = $1)
      ORDER BY (d.status = 'pendente') DESC, d.id DESC LIMIT 300`,
    [status]
  );
  res.json({ devolucoes });
});

// Confirmação da condição da mercadoria (somente gerente)
rotas.post('/devolucoes/:id/avaliar', exigirGerente, async (req, res) => {
  const devolucaoId = id(req.params.id, 'Devolução');
  const aprovar = req.body.aprovar === true;
  const parecer = texto(req.body.parecer, 'parecer', { obrigatorio: !aprovar, max: 200 });

  const r = await transacao(async (cliente) => {
    const { rows } = await cliente.query('SELECT * FROM devolucoes WHERE id = $1 FOR UPDATE', [devolucaoId]);
    const d = rows[0];
    if (!d) throw new ErroHttp(404, 'Devolução não encontrada.');
    if (d.status !== 'pendente') throw new ErroHttp(409, 'Esta devolução já foi avaliada.');

    await cliente.query(
      'UPDATE devolucoes SET status = $1, avaliado_por = $2, data_avaliacao = now(), parecer = $3 WHERE id = $4',
      [aprovar ? 'aprovada' : 'reprovada', req.usuario.id, parecer || null, devolucaoId]
    );
    if (!aprovar) return null;
    return movimentar(cliente, {
      produtoId: d.produto_id, tipo: 'devolucao', variacao: d.quantidade, usuarioId: req.usuario.id,
      observacao: `Devolução #${devolucaoId}: ${d.motivo}${parecer ? ' — ' + parecer : ''}`.slice(0, 300),
      devolucaoId,
    });
  });

  if (r) avisar('estoque', r);
  avisar('devolucao', {});
  res.json({ ok: true, movimentacao: r });
});

// ---------------------------------------------------------------------
// Conferência de estoque (físico x sistema) — somente gerente.
// Cada divergência vira um "ajuste" com quantidade anterior, corrigida e justificativa.
// ---------------------------------------------------------------------
rotas.post('/conferencia', exigirGerente, async (req, res) => {
  const itens = Array.isArray(req.body.itens) ? req.body.itens : [];
  if (itens.length === 0) throw new ErroHttp(400, 'Informe a quantidade contada de pelo menos um produto.');
  if (itens.length > 2000) throw new ErroHttp(400, 'Itens demais em uma única conferência.');

  const resultado = await transacao(async (cliente) => {
    const ajustes = [];
    let conferidos = 0;
    for (const item of itens) {
      const produtoId = id(item.produto_id, 'Produto');
      const contado = inteiro(item.quantidade_contada, 'quantidade contada');
      const { rows } = await cliente.query('SELECT nome, quantidade FROM produtos WHERE id = $1 FOR UPDATE', [produtoId]);
      const p = rows[0];
      if (!p) throw new ErroHttp(404, `Produto ${produtoId} não encontrado.`);
      conferidos++;
      const diferenca = contado - p.quantidade;
      if (diferenca === 0) continue;
      const justificativa = texto(item.justificativa, `justificativa (${p.nome})`, { obrigatorio: true, max: 280 });
      ajustes.push(await movimentar(cliente, {
        produtoId, tipo: 'ajuste', variacao: diferenca, usuarioId: req.usuario.id,
        observacao: `Conferência: ${justificativa}`,
      }));
    }
    return { conferidos, ajustes };
  });

  if (resultado.ajustes.length) avisar('estoque', {});
  res.json(resultado);
});

// ---------------------------------------------------------------------
// Resumo da tela inicial do painel
// ---------------------------------------------------------------------
rotas.get('/resumo', exigirLogin, async (req, res) => {
  const totais = await consultarUm(
    `SELECT COUNT(*)::int AS produtos,
            COUNT(*) FILTER (WHERE quantidade = 0)::int AS esgotados,
            COUNT(*) FILTER (WHERE quantidade > 0 AND quantidade <= estoque_minimo)::int AS estoque_baixo,
            COALESCE(SUM(quantidade::bigint * preco_centavos), 0)::bigint AS valor_estoque_centavos,
            (SELECT COUNT(*) FROM devolucoes WHERE status = 'pendente')::int AS devolucoes_pendentes,
            (SELECT COUNT(*) FROM orcamentos WHERE status = 'emitido' AND data_validade >= current_date)::int AS orcamentos_validos,
            (SELECT COUNT(*) FROM movimentacoes WHERE data::date = current_date)::int AS movimentacoes_hoje
       FROM produtos WHERE ativo`
  );
  const alertas = await consultar(
    `SELECT id, codigo, nome, quantidade, estoque_minimo, unidade FROM produtos
      WHERE ativo AND quantidade <= estoque_minimo ORDER BY quantidade, nome LIMIT 15`
  );
  const ultimas = await consultar(
    `SELECT m.tipo, m.quantidade, m.saldo_anterior, m.saldo_posterior, m.data, p.nome AS produto, p.unidade,
            u.nome AS funcionario
       FROM movimentacoes m JOIN produtos p ON p.id = m.produto_id JOIN usuarios u ON u.id = m.usuario_id
      ORDER BY m.id DESC LIMIT 8`
  );
  // Unidades que entraram e saíram por dia nos últimos 14 dias (gráfico do painel)
  const porDia = await consultar(
    `SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia,
            COALESCE(SUM(m.quantidade) FILTER (WHERE m.tipo IN ('entrada', 'devolucao')), 0)::int AS entradas,
            COALESCE(SUM(m.quantidade) FILTER (WHERE m.tipo = 'saida'), 0)::int AS saidas
       FROM generate_series(current_date - 13, current_date, interval '1 day') AS d(dia)
       LEFT JOIN movimentacoes m ON m.data::date = d.dia::date
      GROUP BY d.dia ORDER BY d.dia`
  );
  res.json({ totais, alertas, ultimas, por_dia: porDia });
});

module.exports = rotas;
