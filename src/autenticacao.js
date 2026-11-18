// Autenticação de funcionários e controle de permissões por perfil
const { consultarUm, consultar } = require('./db');
const { ErroHttp } = require('./erros');

const NOME_COOKIE = 'sessao';
const DURACAO_SESSAO_HORAS = 8; // um turno de trabalho
const producao = process.env.NODE_ENV === 'production';

function lerCookies(req) {
  const cookies = {};
  for (const par of (req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) cookies[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return cookies;
}

function tokenDaRequisicao(req) {
  const token = lerCookies(req)[NOME_COOKIE];
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

/** Middleware: coloca o funcionário logado (ou null) em req.usuario. */
async function carregarUsuario(req, res, next) {
  req.usuario = null;
  const token = tokenDaRequisicao(req);
  if (token) {
    req.usuario = await consultarUm(
      `SELECT u.id, u.nome, u.login, u.perfil
         FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token = $1 AND s.expira_em > now() AND u.ativo`,
      [token]
    );
  }
  next();
}

async function criarSessao(usuarioId, token) {
  await consultar(
    `INSERT INTO sessoes (token, usuario_id, expira_em) VALUES ($1, $2, now() + $3::interval)`,
    [token, usuarioId, `${DURACAO_SESSAO_HORAS} hours`]
  );
  await consultar('DELETE FROM sessoes WHERE expira_em <= now()');
}

function opcoesCookie() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: producao, // só por HTTPS quando publicado
    path: '/',
    maxAge: DURACAO_SESSAO_HORAS * 3600 * 1000,
  };
}

function exigirLogin(req, res, next) {
  if (!req.usuario) return next(new ErroHttp(401, 'Faça login para continuar.'));
  next();
}

function exigirGerente(req, res, next) {
  if (!req.usuario) return next(new ErroHttp(401, 'Faça login para continuar.'));
  if (req.usuario.perfil !== 'gerente') {
    return next(new ErroHttp(403, 'Apenas funcionários com perfil Gerente podem realizar esta operação.'));
  }
  next();
}

module.exports = {
  NOME_COOKIE,
  tokenDaRequisicao,
  carregarUsuario,
  criarSessao,
  opcoesCookie,
  exigirLogin,
  exigirGerente,
};
