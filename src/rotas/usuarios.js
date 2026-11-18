// Cadastro de funcionários (somente gerente)
const express = require('express');
const { consultar, consultarUm } = require('../db');
const { ErroHttp, texto, id } = require('../erros');
const { exigirGerente } = require('../autenticacao');
const { gerarHashSenha } = require('../seguranca');

const rotas = express.Router();
const PERFIS = ['atendente', 'gerente'];

function validarPerfil(perfil) {
  if (!PERFIS.includes(perfil)) throw new ErroHttp(400, 'Perfil inválido.');
  return perfil;
}

function validarSenha(senha) {
  const s = String(senha || '');
  if (s.length < 6) throw new ErroHttp(400, 'A senha deve ter pelo menos 6 caracteres.');
  return s;
}

rotas.get('/usuarios', exigirGerente, async (req, res) => {
  const usuarios = await consultar('SELECT id, nome, login, perfil, ativo, criado_em FROM usuarios ORDER BY nome');
  res.json({ usuarios });
});

rotas.post('/usuarios', exigirGerente, async (req, res) => {
  const nome = texto(req.body.nome, 'nome', { obrigatorio: true, max: 100 });
  const login = texto(req.body.login, 'usuário', { obrigatorio: true, max: 50 }).toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(login)) {
    throw new ErroHttp(400, 'O usuário deve ter de 3 a 50 caracteres: letras, números, ponto, hífen ou sublinhado.');
  }
  const perfil = validarPerfil(req.body.perfil);
  const senha = validarSenha(req.body.senha);
  if (await consultarUm('SELECT 1 FROM usuarios WHERE login = $1', [login])) {
    throw new ErroHttp(409, 'Já existe um funcionário com esse usuário.');
  }
  const u = await consultarUm(
    'INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES ($1, $2, $3, $4) RETURNING id',
    [nome, login, gerarHashSenha(senha), perfil]
  );
  res.status(201).json({ id: u.id });
});

rotas.put('/usuarios/:id', exigirGerente, async (req, res) => {
  const usuarioId = id(req.params.id, 'Funcionário');
  const u = await consultarUm('SELECT perfil FROM usuarios WHERE id = $1', [usuarioId]);
  if (!u) throw new ErroHttp(404, 'Funcionário não encontrado.');

  const nome = texto(req.body.nome, 'nome', { obrigatorio: true, max: 100 });
  const perfil = validarPerfil(req.body.perfil);
  const ativo = req.body.ativo === true;

  // A loja nunca fica sem nenhum gerente ativo
  if ((perfil !== 'gerente' || !ativo) && u.perfil === 'gerente') {
    const outros = await consultarUm(
      "SELECT COUNT(*)::int AS n FROM usuarios WHERE perfil = 'gerente' AND ativo AND id <> $1", [usuarioId]
    );
    if (outros.n === 0) throw new ErroHttp(409, 'É preciso manter pelo menos um gerente ativo no sistema.');
  }
  if (usuarioId === req.usuario.id && !ativo) throw new ErroHttp(409, 'Você não pode desativar o próprio usuário.');

  await consultar('UPDATE usuarios SET nome = $1, perfil = $2, ativo = $3 WHERE id = $4', [nome, perfil, ativo, usuarioId]);
  if (req.body.nova_senha) {
    await consultar('UPDATE usuarios SET senha_hash = $1 WHERE id = $2',
      [gerarHashSenha(validarSenha(req.body.nova_senha)), usuarioId]);
  }
  // Desativou ou trocou a senha de outra pessoa: encerra as sessões abertas dela
  if ((!ativo || req.body.nova_senha) && usuarioId !== req.usuario.id) {
    await consultar('DELETE FROM sessoes WHERE usuario_id = $1', [usuarioId]);
  }
  res.json({ ok: true });
});

module.exports = rotas;
