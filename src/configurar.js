// Cria o arquivo .env com o endereço do banco (usado pelo iniciar.bat).
// Se o .env já tiver um endereço válido, não pergunta nada.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const ARQUIVO = path.join(__dirname, '..', '.env');

function enderecoAtual() {
  if (!fs.existsSync(ARQUIVO)) return null;
  const linha = fs.readFileSync(ARQUIVO, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  const valor = linha ? linha.slice('DATABASE_URL='.length).trim() : '';
  return valor && !valor.includes('endereco-do-banco') ? valor : null;
}

/** Aceita o endereço puro, entre aspas ou o comando "psql '...'" que o Neon mostra. */
function limpar(texto) {
  const achado = /postgres(?:ql)?:\/\/[^\s'"]+/.exec(String(texto || ''));
  return achado ? achado[0] : null;
}

async function main() {
  if (enderecoAtual()) {
    console.log('Banco já configurado (arquivo .env).');
    return;
  }
  console.log('');
  console.log('Primeira vez: falta o endereço do banco de dados.');
  console.log('No site do Neon, abra o projeto, clique em "Connect" e copie o endereço');
  console.log('que começa com postgresql://');
  console.log('');

  const pergunta = 'Cole o endereço aqui (botão direito do mouse cola) e aperte Enter: ';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let url = null;
  process.stdout.write(pergunta);
  for await (const resposta of rl) {
    url = limpar(resposta);
    if (url) break;
    process.stdout.write('Esse texto não parece o endereço do banco. Ele precisa começar com postgresql://\n\n' + pergunta);
  }
  rl.close();
  if (!url) throw new Error('nenhum endereço foi colado.');

  fs.writeFileSync(ARQUIVO, `# Endereço do banco PostgreSQL (não envie este arquivo para o GitHub)\nDATABASE_URL=${url}\nPORT=3000\n`);
  console.log('Arquivo .env criado.');
}

main().catch((erro) => {
  console.error('Não foi possível criar o .env:', erro.message);
  process.exit(1);
});
