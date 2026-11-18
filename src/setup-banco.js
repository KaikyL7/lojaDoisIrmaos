// Cria as tabelas no PostgreSQL e coloca os dados de exemplo.
//   npm run setup      → cria o que falta (pode rodar quantas vezes quiser)
//   npm run reset-db   → APAGA tudo e recria com os dados de exemplo
const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('./db');

const pasta = path.join(__dirname, '..', 'database');
const TABELAS = ['historico_precos', 'movimentacoes', 'orcamento_itens', 'orcamentos', 'devolucoes',
  'produtos', 'categorias', 'imagens', 'sessoes', 'usuarios'];

async function main() {
  const resetar = process.argv.includes('--resetar');
  if (resetar) {
    await pool.query(`DROP TABLE IF EXISTS ${TABELAS.join(', ')} CASCADE`);
    console.log('Tabelas antigas apagadas.');
  }

  await pool.query(fs.readFileSync(path.join(pasta, 'schema.sql'), 'utf8'));
  console.log('Tabelas criadas/conferidas.');

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios');
  if (rows[0].n === 0) {
    await pool.query(fs.readFileSync(path.join(pasta, 'seed.sql'), 'utf8'));
    console.log('Dados de exemplo inseridos.');
    console.log('Usuários de teste: gerente / gerente123  ·  atendente / atendente123');
  } else {
    console.log('O banco já tem dados; nada foi apagado.');
  }
}

main()
  .catch((erro) => {
    console.error('\nNão foi possível preparar o banco:', erro.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
