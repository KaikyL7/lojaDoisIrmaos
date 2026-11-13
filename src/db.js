// Conexão com o banco SQLite (módulo nativo do Node.js, sem dependências)
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { gerarHashSenha } = require('./seguranca');

const PASTA_DADOS = path.join(__dirname, '..', 'data');
const ARQUIVO_BANCO = process.env.DB_FILE || path.join(PASTA_DADOS, 'loja.db');
const ARQUIVO_SCHEMA = path.join(__dirname, '..', 'database', 'schema.sql');

fs.mkdirSync(path.dirname(ARQUIVO_BANCO), { recursive: true });

const db = new DatabaseSync(ARQUIVO_BANCO);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(ARQUIVO_SCHEMA, 'utf8'));

/**
 * Executa várias operações como uma única transação:
 * ou tudo é gravado, ou nada é gravado (confiabilidade do estoque).
 */
function transacao(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

// ---------------------------------------------------------------------
// Dados iniciais (executado apenas quando o banco está vazio)
// ---------------------------------------------------------------------
function popularBanco() {
  const jaTemUsuarios = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n > 0;
  if (jaTemUsuarios) return;

  transacao(() => {
    const inserirUsuario = db.prepare(
      'INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?, ?, ?, ?)'
    );
    const gerente = inserirUsuario.run('Gerente da Loja', 'gerente', gerarHashSenha('gerente123'), 'gerente');
    inserirUsuario.run('Atendente Balcão', 'atendente', gerarHashSenha('atendente123'), 'atendente');
    const idGerente = Number(gerente.lastInsertRowid);

    const categorias = [
      'Materiais Básicos',
      'Hidráulica',
      'Elétrica',
      'Ferramentas',
      'Tintas e Acabamentos',
    ];
    const idCategoria = {};
    const inserirCategoria = db.prepare('INSERT INTO categorias (nome) VALUES (?)');
    for (const nome of categorias) {
      idCategoria[nome] = Number(inserirCategoria.run(nome).lastInsertRowid);
    }

    // [código, nome, categoria, unidade, preço (R$), qtd, mínimo, imagem, descrição, especificações]
    const produtos = [
      ['MB-001', 'Cimento CP II-E-32 50kg', 'Materiais Básicos', 'saco', 38.9, 120, 30, 'saco-cimento.svg',
        'Cimento Portland composto, indicado para uso geral: concreto, argamassa de assentamento e reboco.',
        'Tipo: CP II-E-32\nPeso: 50 kg\nResistência: 32 MPa aos 28 dias\nIndicação: uso geral'],
      ['MB-002', 'Cimento CP V-ARI 50kg', 'Materiais Básicos', 'saco', 44.5, 40, 15, 'saco-cimento.svg',
        'Cimento de alta resistência inicial, ideal para pré-moldados e desforma rápida. Não confundir com o CP II.',
        'Tipo: CP V-ARI\nPeso: 50 kg\nResistência: alta resistência inicial\nIndicação: pré-moldados, lajes'],
      ['HI-001', 'Tubo PVC Soldável 25mm 6m', 'Hidráulica', 'barra', 32.9, 45, 15, 'tubo.svg',
        'Tubo para água fria, junta soldável. Bitola 25 mm (equivale a 3/4").',
        'Diâmetro: 25 mm (3/4")\nComprimento: 6 m\nLinha: água fria soldável\nPressão: 7,5 kgf/cm²'],
      ['HI-002', 'Tubo PVC Soldável 32mm 6m', 'Hidráulica', 'barra', 54.9, 4, 10, 'tubo.svg',
        'Tubo para água fria, junta soldável. Bitola 32 mm (equivale a 1"). Atenção à bitola: não é o de 25 mm.',
        'Diâmetro: 32 mm (1")\nComprimento: 6 m\nLinha: água fria soldável\nPressão: 7,5 kgf/cm²'],
      ['HI-004', 'Caixa d\'Água Polietileno 500L', 'Hidráulica', 'un', 389.0, 0, 2, 'caixa-dagua.svg',
        'Caixa d\'água em polietileno com tampa, resistente a raios UV.',
        'Capacidade: 500 litros\nMaterial: polietileno\nAltura: 0,66 m\nDiâmetro: 1,20 m'],
      ['EL-001', 'Cabo Flexível 2,5mm² 100m Azul', 'Elétrica', 'rolo', 219.0, 12, 5, 'cabo.svg',
        'Cabo flexível para instalações de tomadas de uso geral.',
        'Seção: 2,5 mm²\nComprimento: 100 m\nTensão: 450/750 V\nCor: azul (neutro)'],
      ['EL-002', 'Cabo Flexível 4mm² 100m Preto', 'Elétrica', 'rolo', 339.0, 6, 4, 'cabo.svg',
        'Cabo flexível para circuitos de chuveiro e ar-condicionado. Seção maior que o de 2,5 mm².',
        'Seção: 4 mm²\nComprimento: 100 m\nTensão: 450/750 V\nCor: preto (fase)'],
      ['FE-002', 'Trena Emborrachada 5m', 'Ferramentas', 'un', 24.9, 3, 5, 'trena.svg',
        'Trena com fita de aço, trava e capa emborrachada.',
        'Comprimento: 5 m\nLargura da fita: 19 mm\nTrava: sim'],
      ['TI-001', 'Tinta Acrílica Fosca Branco Neve 18L', 'Tintas e Acabamentos', 'lata', 289.0, 14, 5, 'tinta.svg',
        'Tinta acrílica fosca para paredes internas e externas, alto rendimento.',
        'Volume: 18 L\nAcabamento: fosco\nCor: branco neve\nRendimento: até 380 m² por demão'],
    ];

    const inserirProduto = db.prepare(`
      INSERT INTO produtos (codigo, nome, categoria_id, unidade, preco_centavos, quantidade,
                            estoque_minimo, imagem, descricao, especificacoes)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`);
    const inserirMov = db.prepare(`
      INSERT INTO movimentacoes (produto_id, tipo, quantidade, saldo_anterior, saldo_posterior, observacao, usuario_id)
      VALUES (?, 'entrada', ?, 0, ?, 'Estoque inicial (implantação do sistema)', ?)`);
    const atualizarQtd = db.prepare('UPDATE produtos SET quantidade = ? WHERE id = ?');

    for (const [codigo, nome, cat, un, preco, qtd, min, img, desc, espec] of produtos) {
      const r = inserirProduto.run(codigo, nome, idCategoria[cat], un, Math.round(preco * 100), min,
        '/img/produtos/' + img, desc, espec);
      const id = Number(r.lastInsertRowid);
      if (qtd > 0) {
        inserirMov.run(id, qtd, qtd, idGerente);
        atualizarQtd.run(qtd, id);
      }
    }
  });

  console.log('Banco de dados criado com dados de exemplo.');
}

popularBanco();

module.exports = { db, transacao, ARQUIVO_BANCO };
