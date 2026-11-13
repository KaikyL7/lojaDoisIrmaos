// Funções de segurança: senhas, tokens de sessão e limite de tentativas de login
const crypto = require('node:crypto');

/** Gera o hash da senha com scrypt e um "salt" aleatório (a senha nunca é salva em texto puro). */
function gerarHashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/** Compara a senha digitada com o hash salvo, em tempo constante. */
function conferirSenha(senha, senhaHash) {
  const [salt, hash] = String(senhaHash).split(':');
  if (!salt || !hash) return false;
  const calculado = crypto.scryptSync(senha, salt, 64);
  const salvo = Buffer.from(hash, 'hex');
  return salvo.length === calculado.length && crypto.timingSafeEqual(salvo, calculado);
}

function gerarToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Bloqueia temporariamente um IP após várias senhas erradas seguidas
const tentativas = new Map(); // ip -> { erros, bloqueadoAte }
const MAX_ERROS = 5;
const BLOQUEIO_MS = 10 * 60 * 1000;

function loginBloqueado(ip) {
  const t = tentativas.get(ip);
  return Boolean(t && t.bloqueadoAte && t.bloqueadoAte > Date.now());
}

function registrarFalhaLogin(ip) {
  const t = tentativas.get(ip) || { erros: 0, bloqueadoAte: 0 };
  t.erros += 1;
  if (t.erros >= MAX_ERROS) {
    t.bloqueadoAte = Date.now() + BLOQUEIO_MS;
    t.erros = 0;
  }
  tentativas.set(ip, t);
}

function limparFalhasLogin(ip) {
  tentativas.delete(ip);
}

module.exports = {
  gerarHashSenha,
  conferirSenha,
  gerarToken,
  loginBloqueado,
  registrarFalhaLogin,
  limparFalhasLogin,
};
