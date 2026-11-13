// Atualização em tempo real com Server-Sent Events (SSE).
// Cada navegador aberto mantém uma conexão; quando o estoque muda,
// o servidor avisa todos e as telas recarregam os dados sozinhas.

const clientes = new Set(); // { res, publico }

function conectar(req, res, { publico = false } = {}) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
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
function avisar(evento, dados = {}) {
  const completo = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
  const resumido = `event: ${evento}\ndata: {}\n\n`;
  for (const c of clientes) {
    if (c.publico && evento !== 'estoque') continue;
    c.res.write(c.publico ? resumido : completo);
  }
}

module.exports = { conectar, avisar };
