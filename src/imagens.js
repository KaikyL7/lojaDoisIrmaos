// Fotos de produto enviadas pelo painel (PNG, JPG ou WEBP, até 2 MB).
// São guardadas na tabela "imagens" do banco e servidas em /imagens/<id>.
const fs = require('node:fs');
const path = require('node:path');
const { ErroHttp } = require('./erros');

const PASTA_ILUSTRACOES = path.join(__dirname, '..', 'public', 'img', 'produtos');
const TAMANHO_MAX = 2 * 1024 * 1024;
const TIPOS = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

// Confere os primeiros bytes do arquivo, não só o tipo informado pelo navegador
function detectarTipo(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Valida uma imagem em "data URL" (base64) e devolve { tipo, dados }. */
function lerImagemEnviada(dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new ErroHttp(400, 'Imagem inválida. Use um arquivo PNG, JPG ou WEBP.');
  const dados = Buffer.from(m[2], 'base64');
  if (dados.length > TAMANHO_MAX) throw new ErroHttp(400, 'A imagem deve ter no máximo 2 MB.');
  const tipo = detectarTipo(dados);
  if (!tipo) throw new ErroHttp(400, 'O arquivo enviado não é uma imagem PNG, JPG ou WEBP válida.');
  return { tipo: TIPOS[tipo], dados };
}

/** Lista as ilustrações prontas que podem ser usadas quando não há foto. */
function listarIlustracoes() {
  try {
    return fs.readdirSync(PASTA_ILUSTRACOES).filter((f) => f.endsWith('.svg')).sort()
      .map((f) => `/img/produtos/${f}`);
  } catch {
    return [];
  }
}

/**
 * Decide a imagem do produto: nova foto enviada (gravada no banco),
 * ilustração escolhida ou a imagem atual. Chamar dentro da transação.
 */
async function resolverImagem(cliente, body, imagemAtual, usuarioId) {
  if (body.imagem_upload) {
    const { tipo, dados } = lerImagemEnviada(body.imagem_upload);
    const { rows } = await cliente.query(
      'INSERT INTO imagens (tipo, dados, tamanho, enviado_por) VALUES ($1, $2, $3, $4) RETURNING id',
      [tipo, dados, dados.length, usuarioId]
    );
    return `/imagens/${rows[0].id}`;
  }
  if (body.imagem) {
    const escolhida = String(body.imagem);
    if (escolhida === imagemAtual) return imagemAtual;
    if (listarIlustracoes().includes(escolhida)) return escolhida;
    throw new ErroHttp(400, 'Ilustração inválida.');
  }
  if (imagemAtual) return imagemAtual;
  throw new ErroHttp(400, 'Todo produto precisa ter uma imagem. Envie uma foto ou escolha uma ilustração.');
}

module.exports = { lerImagemEnviada, listarIlustracoes, resolverImagem };
