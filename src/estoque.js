// Regra central do estoque: toda alteração de saldo passa por aqui.
// Assim o saldo e o histórico de movimentações nunca ficam diferentes.
const { ErroHttp } = require('./erros');

/**
 * Movimenta o estoque de um produto. Deve ser chamada dentro de transacao(),
 * recebendo o "cliente" da transação.
 *
 * O "SELECT ... FOR UPDATE" trava a linha do produto até o fim da transação:
 * se dois atendentes venderem o mesmo item ao mesmo tempo, o segundo espera
 * o primeiro terminar e enxerga o saldo já atualizado.
 */
async function movimentar(cliente, { produtoId, tipo, variacao, usuarioId, observacao = null, orcamentoId = null, devolucaoId = null }) {
  const { rows } = await cliente.query(
    'SELECT id, nome, quantidade, unidade, ativo FROM produtos WHERE id = $1 FOR UPDATE',
    [produtoId]
  );
  const p = rows[0];
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

  await cliente.query('UPDATE produtos SET quantidade = $1 WHERE id = $2', [saldoPosterior, produtoId]);

  const mov = await cliente.query(
    `INSERT INTO movimentacoes
       (produto_id, tipo, quantidade, saldo_anterior, saldo_posterior, observacao, usuario_id, orcamento_id, devolucao_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [produtoId, tipo, Math.abs(variacao), saldoAnterior, saldoPosterior, observacao || null, usuarioId,
      orcamentoId, devolucaoId]
  );

  return {
    movimentacao_id: mov.rows[0].id,
    produto_id: produtoId,
    produto: p.nome,
    tipo,
    saldo_anterior: saldoAnterior,
    saldo_posterior: saldoPosterior,
  };
}

module.exports = { movimentar };
