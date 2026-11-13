// Apaga o banco de dados para que ele seja recriado com os dados de exemplo
// Uso: npm run reset-db   (com o servidor desligado)
const fs = require('node:fs');
const path = require('node:path');

const pasta = path.join(__dirname, '..', 'data');
for (const arquivo of ['loja.db', 'loja.db-wal', 'loja.db-shm']) {
  fs.rmSync(path.join(pasta, arquivo), { force: true });
}
console.log('Banco apagado. Ele será recriado com os dados de exemplo no próximo "npm start".');
