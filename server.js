// =====================================================================
//  Loja Dois Irmãos – Casa & Obra
//  Servidor web (Node.js + Express) com banco PostgreSQL.
//  Iniciar:  npm start   →   http://localhost:3000
// =====================================================================
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');

const { carregarUsuario } = require('./src/autenticacao');
const { tratarErros, ErroHttp } = require('./src/erros');
const { consultarUm } = require('./src/db');
const tempoReal = require('./src/tempo-real');

const app = express();
const PORTA = Number(process.env.PORT) || 3000;
const PUBLICO = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1); // atrás do proxy da hospedagem, req.ip é o IP real do visitante

// Cabeçalhos de segurança
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self'",
      "connect-src 'self'",
      'frame-src https://www.google.com', // mapa da loja
      "frame-ancestors 'none'",
    ].join('; ')
  );
  next();
});

app.use(express.json({ limit: '4mb' }));
app.use(carregarUsuario);

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------
app.get('/api/eventos', (req, res) => tempoReal.conectar(req, res, { publico: !req.usuario }));
app.use('/api/auth', require('./src/rotas/auth'));
app.use('/api', require('./src/rotas/produtos'));
app.use('/api', require('./src/rotas/estoque'));
app.use('/api', require('./src/rotas/orcamentos'));
app.use('/api', require('./src/rotas/usuarios'));
app.use('/api', (req, res, next) => next(new ErroHttp(404, 'Rota não encontrada.')));

// ---------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------
// O painel só abre para funcionários logados
app.use('/painel', (req, res, next) => {
  if (!req.usuario && (req.path === '/' || req.path.endsWith('.html'))) {
    return res.redirect('/login.html?voltar=' + encodeURIComponent(req.originalUrl));
  }
  next();
});

// Fotos de produto guardadas no banco
app.get('/imagens/:id', async (req, res) => {
  const imagemId = Number(req.params.id);
  const img = Number.isInteger(imagemId) && imagemId > 0
    ? await consultarUm('SELECT tipo, dados FROM imagens WHERE id = $1', [imagemId])
    : null;
  if (!img) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=604800, immutable'); // a foto de um id nunca muda
  res.type(img.tipo).send(img.dados);
});

// Página de cada produto com endereço próprio: /produto/HI-001
app.get('/produto/:ref', (req, res) => res.sendFile(path.join(PUBLICO, 'produto.html')));

app.use(express.static(PUBLICO, { extensions: ['html'], maxAge: '5m' }));

app.use((req, res) => {
  res.status(404).type('html').send(fs.readFileSync(path.join(PUBLICO, '404.html')));
});

app.use(tratarErros);

app.listen(PORTA, () => {
  console.log('');
  console.log('  Loja Dois Irmãos – Casa & Obra');
  console.log(`  Site:   http://localhost:${PORTA}`);
  console.log(`  Painel: http://localhost:${PORTA}/login.html`);
  console.log('');
  tempoReal.escutarBanco();
});
