// Atualização em tempo real.
//
// 1. O PostgreSQL avisa quando o estoque muda (gatilho + pg_notify, ver schema.sql).
// 2. O servidor escuta esses avisos com LISTEN.
// 3. O servidor repassa o aviso para cada navegador aberto via Server-Sent Events (SSE),
//    e as telas recarregam os dados sozinhas.
const { Client } = require('pg');
const { URL_BANCO, local } = require('./db');

const clientes = new Set(); // { res, publico }
let escutandoBanco = false;

function conectar(req, res, { publico = false } = {}) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const cliente = { res, publico };
  clientes.add(cliente);

  // Mensagem vazia a cada 25s para manter a conexão viva
  const pulso = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(pulso);
    clientes.delete(cliente);
  });
}

/**
 * Envia um evento para todos os navegadores conectados.
 * Visitantes do catálogo público recebem só o aviso, sem quantidades.
 */
function enviar(evento, dados = {}) {
  const completo = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
  const resumido = `event: ${evento}\ndata: {}\n\n`;
  for (const c of clientes) {
    if (c.publico && evento !== 'estoque') continue;
    c.res.write(c.publico ? resumido : completo);
  }
}

/**
 * Aviso feito pelo próprio servidor. Só é usado se a escuta do banco
 * estiver fora do ar; com o LISTEN funcionando, quem avisa é o banco.
 */
function avisar(evento, dados = {}) {
  if (!escutandoBanco) enviar(evento, dados);
}

/**
 * Conexão dedicada que fica escutando os canais "estoque" e "devolucao".
 * No Neon, o endereço com "-pooler" não aceita LISTEN, então usamos o endereço direto.
 */
async function escutarBanco() {
  const urlDireta = URL_BANCO.replace('-pooler.', '.');
  const ouvinte = new Client({ connectionString: urlDireta, ssl: local ? false : { rejectUnauthorized: false } });

  let encerrado = false;
  const tentarDeNovo = () => {
    if (encerrado) return; // evita reconectar duas vezes
    encerrado = true;
    escutandoBanco = false;
    ouvinte.end().catch(() => {});
    setTimeout(escutarBanco, 5000);
  };

  try {
    await ouvinte.connect();
    await ouvinte.query('LISTEN estoque');
    await ouvinte.query('LISTEN devolucao');
    escutandoBanco = true;
    ouvinte.on('notification', (msg) => {
      let dados = {};
      try { dados = JSON.parse(msg.payload || '{}'); } catch { /* aviso sem dados */ }
      enviar(msg.channel, dados);
    });
    ouvinte.on('error', (erro) => {
      console.error('Tempo real: conexão de escuta caiu, reconectando...', erro.message);
      tentarDeNovo();
    });
  } catch (erro) {
    console.error('Tempo real: não foi possível escutar o banco (', erro.message, '). Tentando de novo em 5s.');
    tentarDeNovo();
  }
}

module.exports = { conectar, avisar, escutarBanco };
