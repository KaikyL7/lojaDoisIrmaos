// Pedidos de orçamento enviados pelo site (lista do cliente + nome e CPF)
const express = require('express');
const { consultar, consultarUm, transacao } = require('../db');
const { ErroHttp, texto, inteiro, id } = require('../erros');
const { exigirLogin } = require('../autenticacao');
const { avisar } = require('../tempo-real');

const rotas = express.Router();

/** Confere os dígitos verificadores do CPF. Devolve só os números ou lança erro. */
function cpfValido(valor) {
  const cpf = String(valor ?? '').replace(/\D/g, '');
  const invalido = new ErroHttp(400, 'CPF inválido. Confira os números digitados.');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) throw invalido;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const digito = ((soma * 10) % 11) % 10;
    if (digito !== Number(cpf[tamanho])) throw invalido;
  }
  return cpf;
}

// Evita que alguém encha o banco de pedidos falsos: no máximo 5 pedidos a cada 10 minutos por IP
const envios = new Map(); // ip -> [horários]
const MAX_PEDIDOS = 5;
const JANELA_MS = 10 * 60 * 1000;

function limitarEnvios(ip) {
  const agora = Date.now();
  const recentes = (envios.get(ip) || []).filter((t) => agora - t < JANELA_MS);
  if (recentes.length >= MAX_PEDIDOS) {
    throw new ErroHttp(429, 'Muitos pedidos enviados em pouco tempo. Aguarde alguns minutos ou fale com a loja pelo WhatsApp.');
  }
  recentes.push(agora);
  envios.set(ip, recentes);
  if (envios.size > 5000) envios.clear(); // não deixa o mapa crescer sem limite
}

// ---------------------------------------------------------------------
// Público: o cliente registra o pedido antes de abrir o WhatsApp
// ---------------------------------------------------------------------
rotas.post('/pedidos-site', async (req, res) => {
  const b = req.body || {};
  const nome = texto(b.nome, 'nome', { obrigatorio: true, max: 120 });
  if (nome.length < 3) throw new ErroHttp(400, 'Informe o nome completo.');
  const cpf = cpfValido(b.cpf);

  if (!Array.isArray(b.itens) || b.itens.length === 0) throw new ErroHttp(400, 'Sua lista está vazia.');
  if (b.itens.length > 100) throw new ErroHttp(400, 'Itens demais em um único pedido.');
  const somados = new Map();
  for (const item of b.itens) {
    const produtoId = id(item.produto_id, 'Produto');
    const qtd = inteiro(item.quantidade, 'quantidade', { min: 1, max: 9999 });
    somados.set(produtoId, Math.min(9999, (somados.get(produtoId) || 0) + qtd));
  }

  limitarEnvios(req.ip);

  const pedido = await transacao(async (cliente) => {
    // Nome, código e unidade vêm do banco (não confiamos no que o navegador mandou)
    const { rows: produtos } = await cliente.query(
      'SELECT id, codigo, nome, unidade FROM produtos WHERE ativo AND id = ANY($1::int[])', [[...somados.keys()]]
    );
    if (produtos.length === 0) throw new ErroHttp(400, 'Os produtos da lista não estão mais disponíveis no catálogo.');

    const { rows } = await cliente.query(
      'INSERT INTO pedidos_site (cliente_nome, cliente_cpf) VALUES ($1, $2) RETURNING id', [nome, cpf]
    );
    const pedidoId = rows[0].id;
    for (const p of produtos) {
      await cliente.query(
        `INSERT INTO pedido_site_itens (pedido_id, produto_id, produto_codigo, produto_nome, unidade, quantidade)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [pedidoId, p.id, p.codigo, p.nome, p.unidade, somados.get(p.id)]
      );
    }
    return { id: pedidoId, itens_ignorados: somados.size - produtos.length };
  });

  avisar('pedido', { id: pedido.id, status: 'novo' });
  res.status(201).json(pedido);
});

// ---------------------------------------------------------------------
// Painel: funcionários veem e atendem os pedidos
// ---------------------------------------------------------------------
const CONSULTA_PEDIDOS = `
  SELECT pe.id, pe.cliente_nome, pe.cliente_cpf, pe.data, pe.status, pe.data_atendimento, pe.orcamento_id,
         u.nome AS atendido_por,
         COALESCE((SELECT json_agg(json_build_object(
                     'produto_id', i.produto_id, 'codigo', i.produto_codigo, 'nome', i.produto_nome,
                     'unidade', i.unidade, 'quantidade', i.quantidade) ORDER BY i.id)
                     FROM pedido_site_itens i WHERE i.pedido_id = pe.id), '[]') AS itens
    FROM pedidos_site pe LEFT JOIN usuarios u ON u.id = pe.atendido_por`;

rotas.get('/pedidos-site', exigirLogin, async (req, res) => {
  const where = [];
  const params = [];
  if (['novo', 'atendido'].includes(req.query.status)) {
    params.push(req.query.status);
    where.push(`pe.status = $${params.length}`);
  }
  if (req.query.q) {
    const termo = String(req.query.q).slice(0, 80);
    params.push(`%${termo}%`, termo.replace(/\D/g, '') || '-', termo.replace('#', ''));
    const n = params.length;
    where.push(`(pe.cliente_nome ILIKE $${n - 2} OR pe.cliente_cpf LIKE '%' || $${n - 1} || '%' OR pe.id::text = $${n})`);
  }
  const pedidos = await consultar(
    `${CONSULTA_PEDIDOS} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY pe.id DESC LIMIT 300`,
    params
  );
  res.json({ pedidos });
});

rotas.get('/pedidos-site/:id', exigirLogin, async (req, res) => {
  const pedido = await consultarUm(`${CONSULTA_PEDIDOS} WHERE pe.id = $1`, [id(req.params.id, 'Pedido')]);
  if (!pedido) throw new ErroHttp(404, 'Pedido não encontrado.');
  res.json({ pedido });
});

rotas.post('/pedidos-site/:id/atender', exigirLogin, async (req, res) => {
  const pedidoId = id(req.params.id, 'Pedido');
  const atualizado = await consultarUm(
    `UPDATE pedidos_site SET status = 'atendido', atendido_por = $2, data_atendimento = now()
      WHERE id = $1 AND status = 'novo' RETURNING id`,
    [pedidoId, req.usuario.id]
  );
  if (!atualizado) throw new ErroHttp(409, 'Este pedido não existe ou já foi atendido.');
  avisar('pedido', { id: pedidoId, status: 'atendido' });
  res.json({ ok: true });
});

module.exports = rotas;
