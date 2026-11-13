// Mini "framework" HTTP: rotas, leitura de JSON, respostas e erros.
// Feito só com o módulo nativo do Node para o projeto não depender de pacotes externos.

class ErroHttp extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

const rotas = [];

/** Registra uma rota. Ex.: rota('GET', '/api/produtos/:id', handler) */
function rota(metodo, caminho, ...handlers) {
  const nomes = [];
  const regex = new RegExp(
    '^' +
      caminho.replace(/:([a-zA-Z_]+)/g, (_, nome) => {
        nomes.push(nome);
        return '([^/]+)';
      }) +
      '/?$'
  );
  rotas.push({ metodo, regex, nomes, handlers });
}

function encontrarRota(metodo, caminho) {
  for (const r of rotas) {
    if (r.metodo !== metodo) continue;
    const m = r.regex.exec(caminho);
    if (m) {
      const params = {};
      r.nomes.forEach((nome, i) => (params[nome] = decodeURIComponent(m[i + 1])));
      return { handlers: r.handlers, params };
    }
  }
  return null;
}

function enviarJson(res, status, dados) {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(corpo);
}

const LIMITE_CORPO = 4 * 1024 * 1024; // 4 MB (fotos de produto)

function lerCorpoJson(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve({});
    const tipo = req.headers['content-type'] || '';
    let tamanho = 0;
    const partes = [];
    req.on('data', (parte) => {
      tamanho += parte.length;
      if (tamanho > LIMITE_CORPO) {
        reject(new ErroHttp(413, 'Os dados enviados são grandes demais (máx. 4 MB).'));
        req.destroy();
        return;
      }
      partes.push(parte);
    });
    req.on('end', () => {
      if (tamanho === 0) return resolve({});
      // Exigir JSON nas alterações também dificulta ataques CSRF por formulário
      if (!tipo.includes('application/json')) {
        return reject(new ErroHttp(415, 'Envie os dados em formato JSON.'));
      }
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8')));
      } catch {
        reject(new ErroHttp(400, 'JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function lerCookies(req) {
  const cookies = {};
  for (const par of (req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) cookies[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return cookies;
}

// ---------------------------------------------------------------------
// Validação de dados recebidos
// ---------------------------------------------------------------------
function texto(valor, campo, { obrigatorio = false, max = 255 } = {}) {
  const v = valor === undefined || valor === null ? '' : String(valor).trim();
  if (obrigatorio && !v) throw new ErroHttp(400, `O campo "${campo}" é obrigatório.`);
  if (v.length > max) throw new ErroHttp(400, `O campo "${campo}" aceita no máximo ${max} caracteres.`);
  return v;
}

function inteiro(valor, campo, { min = 0, max = 1_000_000 } = {}) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ErroHttp(400, `O campo "${campo}" deve ser um número inteiro entre ${min} e ${max}.`);
  }
  return n;
}

/** Converte "38,90" ou 38.9 em centavos (3890). */
function dinheiroEmCentavos(valor, campo) {
  let s = String(valor ?? '').trim().replace(/^R\$\s*/, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // formato brasileiro 1.234,56
  const n = s === '' ? NaN : Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
    throw new ErroHttp(400, `O campo "${campo}" deve ser um valor em reais válido.`);
  }
  return Math.round(n * 100);
}

module.exports = {
  ErroHttp,
  rota,
  encontrarRota,
  enviarJson,
  lerCorpoJson,
  lerCookies,
  texto,
  inteiro,
  dinheiroEmCentavos,
};
