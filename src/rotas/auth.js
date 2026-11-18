// Rotas de login, logout e dados do funcionário logado
const express = require('express');
const { consultarUm, consultar } = require('../db');
const { ErroHttp, texto } = require('../erros');
const {
  conferirSenha, gerarHashSenha, gerarToken,
  loginBloqueado, registrarFalhaLogin, limparFalhasLogin,
} = require('../seguranca');
const { criarSessao, opcoesCookie, exigirLogin, tokenDaRequisicao, NOME_COOKIE } = require('../autenticacao');

const rotas = express.Router();

rotas.post('/login', async (req, res) => {
  const ip = req.ip;
  if (loginBloqueado(ip)) {
    throw new ErroHttp(429, 'Muitas tentativas de login. Aguarde 10 minutos e tente novamente.');
  }
  const login = texto(req.body.login, 'usuário', { obrigatorio: true, max: 50 }).toLowerCase();
  const senha = String(req.body.senha || '');

  const u = await consultarUm('SELECT id, nome, login, perfil, senha_hash, ativo FROM usuarios WHERE login = $1', [login]);
  if (!u || !u.ativo || !conferirSenha(senha, u.senha_hash)) {
    registrarFalhaLogin(ip);
    throw new ErroHttp(401, 'Usuário ou senha incorretos.');
  }
  limparFalhasLogin(ip);

  const token = gerarToken();
  await criarSessao(u.id, token);
  res.cookie(NOME_COOKIE, token, opcoesCookie());
  res.json({ usuario: { id: u.id, nome: u.nome, login: u.login, perfil: u.perfil } });
});

rotas.post('/logout', async (req, res) => {
  const token = tokenDaRequisicao(req);
  if (token) await consultar('DELETE FROM sessoes WHERE token = $1', [token]);
  res.clearCookie(NOME_COOKIE, { ...opcoesCookie(), maxAge: undefined });
  res.json({ ok: true });
});

rotas.get('/eu', exigirLogin, (req, res) => {
  res.json({ usuario: req.usuario });
});

rotas.post('/senha', exigirLogin, async (req, res) => {
  const atual = String(req.body.senha_atual || '');
  const nova = String(req.body.nova_senha || '');
  const u = await consultarUm('SELECT senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
  if (!conferirSenha(atual, u.senha_hash)) throw new ErroHttp(400, 'A senha atual está incorreta.');
  if (nova.length < 6) throw new ErroHttp(400, 'A nova senha deve ter pelo menos 6 caracteres.');
  await consultar('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [gerarHashSenha(nova), req.usuario.id]);
  res.json({ ok: true });
});

module.exports = rotas;
