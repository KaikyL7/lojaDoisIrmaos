// Regra central do estoque: toda alteração de saldo passa por aqui.
// Assim o saldo e o histórico de movimentações nunca ficam diferentes.
const { db } = require('./db');
const { ErroHttp } = require('./http');

const NOMES_TIPO = { entrada: 'Entrada', saida: 'Saída', devolucao: 'Devolução', ajuste: 'Ajuste' };

/**
 * Movimenta o estoque de um produto (deve ser chamada dentro de transacao()).
 * @param {object} m
 * @param {number} m.produtoId
 * @param {'entrada'|'saida'|'devolucao'|'ajuste'} m.tipo
 * @param {number} m.variacao  quantidade a somar (negativa na saída)
 * @param {number} m.usuarioId funcionário responsável
 * @param {string} [m.observacao]
 * @param {number} [m.orcamentoId]
 * @param {number} [m.devolucaoId]
 */
function movimentar({ produtoId, tipo, variacao, usuarioId, observacao = null, orcamentoId = null, devolucaoId = null }) {
  const p = db.prepare('SELECT id, nome, quantidade, unidade, ativo FROM produtos WHERE id = ?').get(produtoId);
  if (!p) throw new ErroHttp(404, 'Produto não encontrado.');
  if (!p.ativo && tipo === 'saida') throw new ErroHttp(409, `O produto "${p.nome}" está desativado.`);

  const saldoAnterior = p.quantidade;
  const saldoPosterior = saldoAnterior + variacao;

  // Regra de negócio: o saldo nunca pode ficar negativo
  if (saldoPosterior < 0) {
    throw new ErroHttp(
      409,
      `Estoque insuficiente de "${p.nome}": disponível ${saldoAnterior} ${p.unidade}, solicitado ${-variacao} ${p.unidade}.`
    );
  }

  db.prepare("UPDATE produtos SET quantidade = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?")
    .run(saldoPosterior, produtoId);

  const r = db.prepare(
    `INSERT INTO movimentacoes
       (produto_id, tipo, quantidade, saldo_anterior, saldo_posterior, observacao, usuario_id, orcamento_id, devolucao_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(produtoId, tipo, Math.abs(variacao), saldoAnterior, saldoPosterior, observacao || null, usuarioId,
    orcamentoId, devolucaoId);

  return {
    movimentacao_id: Number(r.lastInsertRowid),
    produto_id: produtoId,
    produto: p.nome,
    tipo,
    saldo_anterior: saldoAnterior,
    saldo_posterior: saldoPosterior,
  };
}

module.exports = { movimentar, NOMES_TIPO };
