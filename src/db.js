// Conexão com o PostgreSQL (pacote "pg")
const { Pool, types } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('\n  Falta a variável DATABASE_URL.');
  console.error('  Crie o arquivo .env (copie o .env.example) e cole o endereço do banco.\n');
  process.exit(1);
}

// Colunas DATE chegam como texto "AAAA-MM-DD" (sem conversão de fuso horário)
types.setTypeParser(1082, (valor) => valor);
// COUNT e SUM chegam como número (o padrão do pg é texto para BIGINT)
types.setTypeParser(20, (valor) => Number(valor));

const URL_BANCO = process.env.DATABASE_URL;
const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(URL_BANCO);

const pool = new Pool({
  connectionString: URL_BANCO,
  ssl: local ? false : { rejectUnauthorized: false }, // bancos na nuvem (Neon) exigem SSL
  max: 10,
});

// Todas as datas do sistema no horário de Brasília
pool.on('connect', (cliente) => {
  cliente.query("SET TIME ZONE 'America/Sao_Paulo'");
});

pool.on('error', (erro) => {
  console.error('Erro inesperado na conexão com o banco:', erro.message);
});

/** Executa uma consulta parametrizada (os valores nunca são colados no SQL). */
async function consultar(sql, parametros = []) {
  const resultado = await pool.query(sql, parametros);
  return resultado.rows;
}

async function consultarUm(sql, parametros = []) {
  const linhas = await consultar(sql, parametros);
  return linhas[0] || null;
}

/**
 * Executa várias operações como uma única transação:
 * ou tudo é gravado, ou nada é gravado (confiabilidade do estoque).
 * A função recebe um "cliente" exclusivo, que deve ser usado em todas as consultas.
 */
async function transacao(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}

module.exports = { pool, consultar, consultarUm, transacao, URL_BANCO, local };
