// Autenticação de funcionários e controle de permissões por perfil
const { db } = require('./db');
const { ErroHttp, lerCookies } = require('./http');

const NOME_COOKIE = 'sessao';
const DURACAO_SESSAO_HORAS = 8; // um turno de trabalho

/** Retorna o funcionário logado (ou null) a partir do cookie de sessão. */
function usuarioDaRequisicao(req) {
  const token = lerCookies(req)[NOME_COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const u = db
    .prepare(
      `SELECT u.id, u.nome, u.login, u.perfil
         FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token = ? AND s.expira_em > datetime('now', 'localtime') AND u.ativo = 1`
    )
    .get(token);
  return u ? { ...u } : null;
}

function criarSessao(usuarioId, token) {
  db.prepare(
    `INSERT INTO sessoes (token, usuario_id, expira_em)
     VALUES (?, ?, datetime('now', 'localtime', '+${DURACAO_SESSAO_HORAS} hours'))`
  ).run(token, usuarioId);
  // Limpa sessões vencidas
  db.prepare("DELETE FROM sessoes WHERE expira_em <= datetime('now', 'localtime')").run();
}

function cookieSessao(token) {
  return `${NOME_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DURACAO_SESSAO_HORAS * 3600}`;
}

function cookieSaida() {
  return `${NOME_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

// "Middlewares" usados nas rotas -----------------------------------------
function exigirLogin(req, res, ctx) {
  if (!ctx.usuario) throw new ErroHttp(401, 'Faça login para continuar.');
}

function exigirGerente(req, res, ctx) {
  exigirLogin(req, res, ctx);
  if (ctx.usuario.perfil !== 'gerente') {
    throw new ErroHttp(403, 'Apenas funcionários com perfil Gerente podem realizar esta operação.');
  }
}

module.exports = {
  NOME_COOKIE,
  usuarioDaRequisicao,
  criarSessao,
  cookieSessao,
  cookieSaida,
  exigirLogin,
  exigirGerente,
};
