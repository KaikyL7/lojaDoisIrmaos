// Salva as fotos de produto enviadas pelo painel (PNG, JPG ou WEBP, até 2 MB)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ErroHttp } = require('./http');

const PASTA_UPLOADS = path.join(__dirname, '..', 'public', 'uploads');
const PASTA_ILUSTRACOES = path.join(__dirname, '..', 'public', 'img', 'produtos');
const TAMANHO_MAX = 2 * 1024 * 1024;

// Confere os primeiros bytes do arquivo, não só a extensão informada
function detectarTipo(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Recebe uma imagem em "data URL" (base64) e devolve o caminho público salvo. */
function salvarImagem(dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new ErroHttp(400, 'Imagem inválida. Use um arquivo PNG, JPG ou WEBP.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > TAMANHO_MAX) throw new ErroHttp(400, 'A imagem deve ter no máximo 2 MB.');
  const tipo = detectarTipo(buf);
  if (!tipo) throw new ErroHttp(400, 'O arquivo enviado não é uma imagem PNG, JPG ou WEBP válida.');

  fs.mkdirSync(PASTA_UPLOADS, { recursive: true });
  const nome = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${tipo}`;
  fs.writeFileSync(path.join(PASTA_UPLOADS, nome), buf);
  return `/uploads/${nome}`;
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

/** Decide a imagem do produto: nova foto enviada, ilustração escolhida ou a atual. */
function resolverImagem(body, imagemAtual) {
  if (body.imagem_upload) return salvarImagem(body.imagem_upload);
  if (body.imagem) {
    const escolhida = String(body.imagem);
    if (escolhida === imagemAtual) return imagemAtual;
    if (listarIlustracoes().includes(escolhida)) return escolhida;
    throw new ErroHttp(400, 'Ilustração inválida.');
  }
  if (imagemAtual) return imagemAtual;
  throw new ErroHttp(400, 'Todo produto precisa ter uma imagem. Envie uma foto ou escolha uma ilustração.');
}

module.exports = { salvarImagem, listarIlustracoes, resolverImagem };
