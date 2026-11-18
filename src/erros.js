// Erros com código HTTP e validação dos dados recebidos

class ErroHttp extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

function texto(valor, campo, { obrigatorio = false, max = 255 } = {}) {
  const v = valor === undefined || valor === null ? '' : String(valor).trim();
  if (obrigatorio && !v) throw new ErroHttp(400, `O campo "${campo}" é obrigatório.`);
  if (v.length > max) throw new ErroHttp(400, `O campo "${campo}" aceita no máximo ${max} caracteres.`);
  return v;
}

function inteiro(valor, campo, { min = 0, max = 1_000_000 } = {}) {
  const n = Number(valor);
  if (valor === '' || valor === null || !Number.isInteger(n) || n < min || n > max) {
    throw new ErroHttp(400, `O campo "${campo}" deve ser um número inteiro entre ${min} e ${max}.`);
  }
  return n;
}

/** Converte "38,90", "1.234,56" ou 38.9 em centavos (3890). */
function dinheiroEmCentavos(valor, campo) {
  let s = String(valor ?? '').trim().replace(/^R\$\s*/, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = s === '' ? NaN : Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
    throw new ErroHttp(400, `O campo "${campo}" deve ser um valor em reais válido.`);
  }
  return Math.round(n * 100);
}

/** Identificador numérico vindo da URL ou do corpo. */
function id(valor, campo = 'id') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0 || n > 2_147_483_647) throw new ErroHttp(400, `${campo} inválido.`);
  return n;
}

/** Tratamento central de erros do Express. */
function tratarErros(erro, req, res, next) { // eslint-disable-line no-unused-vars
  if (erro instanceof ErroHttp) {
    return res.status(erro.status).json({ erro: erro.message, detalhes: erro.detalhes });
  }
  if (erro.type === 'entity.too.large') {
    return res.status(413).json({ erro: 'Os dados enviados são grandes demais (máx. 4 MB).' });
  }
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido.' });
  }
  // Restrições do banco que escaparam da validação
  if (erro.code === '23505') return res.status(409).json({ erro: 'Já existe um registro com esse valor.' });
  if (erro.code === '23514') return res.status(409).json({ erro: 'A operação viola uma regra do estoque.' });
  console.error(erro);
  res.status(500).json({ erro: 'Erro interno no servidor. Tente novamente.' });
}

module.exports = { ErroHttp, texto, inteiro, dinheiroEmCentavos, id, tratarErros };
