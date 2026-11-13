// Rotas de login, logout e dados do funcionário logado
const { db } = require('../db');
const { rota, enviarJson, ErroHttp, texto, lerCookies } = require('../http');
const {
  conferirSenha, gerarHashSenha, gerarToken,
  loginBloqueado, registrarFalhaLogin, limparFalhasLogin,
} = require('../seguranca');
const { criarSessao, cookieSessao, cookieSaida, exigirLogin, NOME_COOKIE } = require('../autenticacao');

rota('POST', '/api/auth/login', (req, res, ctx) => {
  const ip = req.socket.remoteAddress;
  if (loginBloqueado(ip)) {
    throw new ErroHttp(429, 'Muitas tentativas de login. Aguarde 10 minutos e tente novamente.');
  }
  const login = texto(ctx.body.login, 'usuário', { obrigatorio: true, max: 50 }).toLowerCase();
  const senha = String(ctx.body.senha || '');

  const u = db.prepare('SELECT id, nome, login, perfil, senha_hash, ativo FROM usuarios WHERE login = ?').get(login);
  if (!u || !u.ativo || !conferirSenha(senha, u.senha_hash)) {
    registrarFalhaLogin(ip);
    throw new ErroHttp(401, 'Usuário ou senha incorretos.');
  }
  limparFalhasLogin(ip);

  const token = gerarToken();
  criarSessao(u.id, token);
  res.setHeader('Set-Cookie', cookieSessao(token));
  enviarJson(res, 200, { usuario: { id: u.id, nome: u.nome, login: u.login, perfil: u.perfil } });
});

rota('POST', '/api/auth/logout', (req, res) => {
  const token = lerCookies(req)[NOME_COOKIE];
  if (token) db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', cookieSaida());
  enviarJson(res, 200, { ok: true });
});

rota('GET', '/api/auth/eu', exigirLogin, (req, res, ctx) => {
  enviarJson(res, 200, { usuario: ctx.usuario });
});

rota('POST', '/api/auth/senha', exigirLogin, (req, res, ctx) => {
  const atual = String(ctx.body.senha_atual || '');
  const nova = String(ctx.body.nova_senha || '');
  const u = db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(ctx.usuario.id);
  if (!conferirSenha(atual, u.senha_hash)) throw new ErroHttp(400, 'A senha atual está incorreta.');
  if (nova.length < 6) throw new ErroHttp(400, 'A nova senha deve ter pelo menos 6 caracteres.');
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(gerarHashSenha(nova), ctx.usuario.id);
  enviarJson(res, 200, { ok: true });
});
