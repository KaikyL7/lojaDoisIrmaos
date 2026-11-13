// =====================================================================
//  Loja Dois Irmãos – Casa & Obra
//  Servidor web: entrega as páginas (HTML/CSS/JS) e a API do sistema.
//  Iniciar:  npm start   →   http://localhost:3000
// =====================================================================
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { encontrarRota, enviarJson, lerCorpoJson, ErroHttp } = require('./src/http');
const { usuarioDaRequisicao } = require('./src/autenticacao');
const tempoReal = require('./src/tempo-real');

// Carrega as rotas da API (cada arquivo registra as suas)
require('./src/rotas/auth');
require('./src/rotas/produtos');
require('./src/rotas/estoque');
require('./src/rotas/orcamentos');
require('./src/rotas/usuarios');

const PORTA = Number(process.env.PORT) || 3000;
const PASTA_PUBLICA = path.join(__dirname, 'public');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function cabecalhosSeguranca(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
  );
}

function servirArquivo(req, res, caminhoUrl, usuario) {
  let relativo = decodeURIComponent(caminhoUrl);
  if (relativo.endsWith('/')) relativo += 'index.html';

  // As páginas do painel só abrem para funcionários logados
  if (relativo.startsWith('/painel/') && relativo.endsWith('.html') && !usuario) {
    res.writeHead(302, { Location: '/login.html?voltar=' + encodeURIComponent(caminhoUrl) });
    return res.end();
  }

  const arquivo = path.normalize(path.join(PASTA_PUBLICA, relativo));
  if (!arquivo.startsWith(PASTA_PUBLICA + path.sep)) {
    res.writeHead(403);
    return res.end('Acesso negado');
  }

  fs.stat(arquivo, (erro, info) => {
    if (erro || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(path.join(PASTA_PUBLICA, '404.html')).pipe(res);
    }
    const ext = path.extname(arquivo).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TIPOS[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    fs.createReadStream(arquivo).pipe(res);
  });
}

const servidor = http.createServer(async (req, res) => {
  cabecalhosSeguranca(res);
  const url = new URL(req.url, 'http://localhost');
  const caminho = url.pathname;

  try {
    const usuario = usuarioDaRequisicao(req);

    if (caminho === '/api/eventos') {
      // Visitantes do catálogo também recebem avisos (sem dados internos)
      return tempoReal.conectar(req, res, { publico: !usuario });
    }

    if (caminho.startsWith('/api/')) {
      const encontrada = encontrarRota(req.method, caminho);
      if (!encontrada) throw new ErroHttp(404, 'Rota não encontrada.');
      const ctx = {
        params: encontrada.params,
        query: Object.fromEntries(url.searchParams),
        body: await lerCorpoJson(req),
        usuario,
      };
      for (const handler of encontrada.handlers) {
        await handler(req, res, ctx);
        if (res.writableEnded) break;
      }
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') throw new ErroHttp(405, 'Método não permitido.');
    servirArquivo(req, res, caminho, usuario);
  } catch (erro) {
    if (res.headersSent) return res.end();
    if (erro instanceof ErroHttp) {
      return enviarJson(res, erro.status, { erro: erro.message, detalhes: erro.detalhes });
    }
    console.error(erro);
    enviarJson(res, 500, { erro: 'Erro interno no servidor. Tente novamente.' });
  }
});

servidor.listen(PORTA, () => {
  console.log('');
  console.log('  Loja Dois Irmãos – Casa & Obra');
  console.log(`  Site:   http://localhost:${PORTA}`);
  console.log(`  Painel: http://localhost:${PORTA}/login.html`);
  console.log('');
});
