-- =====================================================================
--  Dados de exemplo (executado por "npm run setup" só com o banco vazio)
--  Usuários de teste:  gerente / gerente123   ·   atendente / atendente123
-- =====================================================================

INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES
  ('Gerente da Loja', 'gerente',
   '87f3549ab44db4c7a5ceaa7984ddc294:0e562b43f1bb33b93dc621f4b913df05d7bd1f527f7b472605e2bfce39e42de90578a50b21b88b6f2835659280ff4408dbbb42ee022b53c5e183892560401917',
   'gerente'),
  ('Atendente Balcão', 'atendente',
   '726a5aae5a4651eb2c953a4dc3a11b0f:0be3caca69bffbf85de4b3693e518401a6c1554c063d798af91f09fe500714edc8a982d36a4437c40eb61a4a658d8631a852b813eda64f33a2efa3b64bb148f9',
   'atendente');

INSERT INTO categorias (nome, descricao, icone, ordem) VALUES
  ('Materiais Básicos',     'Cimento, argamassa, blocos',  'tijolo',      1),
  ('Hidráulica',            'Tubos, conexões, registros',  'gota',        2),
  ('Elétrica',              'Cabos, disjuntores, tomadas', 'raio',        3),
  ('Ferramentas',           'Para obra e manutenção',      'ferramenta',  4),
  ('Tintas e Acabamentos',  'Tintas, massas, seladores',   'rolo',        5),
  ('Pisos e Revestimentos', 'Porcelanato, cerâmica',       'piso',        6);

-- Produtos (quantidade inicial registrada logo abaixo como movimentação de entrada)
INSERT INTO produtos (codigo, nome, categoria_id, unidade, preco_centavos, quantidade, estoque_minimo,
                      imagem, grupo_semelhanca, destaque, descricao, especificacoes)
SELECT p.codigo, p.nome, c.id, p.unidade, p.preco, p.qtd, p.minimo, '/img/produtos/' || p.imagem,
       p.grupo, p.destaque, p.descricao, p.espec
FROM (VALUES
  ('MB-001', 'Cimento CP II-E-32 50kg', 'Materiais Básicos', 'saco', 3890, 120, 30, 'saco-cimento.svg', 'cimento', TRUE,
   'Cimento Portland composto, indicado para uso geral: concreto, argamassa de assentamento e reboco.',
   E'Tipo: CP II-E-32\nPeso: 50 kg\nResistência: 32 MPa aos 28 dias\nIndicação: uso geral'),
  ('MB-002', 'Cimento CP V-ARI 50kg', 'Materiais Básicos', 'saco', 4450, 40, 15, 'saco-cimento.svg', 'cimento', FALSE,
   'Cimento de alta resistência inicial, ideal para pré-moldados e desforma rápida.',
   E'Tipo: CP V-ARI\nPeso: 50 kg\nResistência: alta resistência inicial\nIndicação: pré-moldados, lajes'),
  ('HI-001', 'Tubo PVC Soldável 25mm 6m', 'Hidráulica', 'barra', 3290, 45, 15, 'tubo.svg', 'tubo-soldavel', TRUE,
   'Tubo para água fria, junta soldável. Bitola 25 mm, que equivale a 3/4 de polegada.',
   E'Diâmetro: 25 mm (3/4")\nComprimento: 6 m\nLinha: água fria, junta soldável\nPressão de serviço: 7,5 kgf/cm²'),
  ('HI-002', 'Tubo PVC Soldável 32mm 6m', 'Hidráulica', 'barra', 5490, 4, 10, 'tubo.svg', 'tubo-soldavel', FALSE,
   'Tubo para água fria, junta soldável. Bitola 32 mm, que equivale a 1 polegada.',
   E'Diâmetro: 32 mm (1")\nComprimento: 6 m\nLinha: água fria, junta soldável\nPressão de serviço: 7,5 kgf/cm²'),
  ('HI-004', 'Caixa d''Água Polietileno 500L', 'Hidráulica', 'un', 38900, 0, 2, 'caixa-dagua.svg', NULL, TRUE,
   'Caixa d''água em polietileno com tampa, resistente a raios UV.',
   E'Capacidade: 500 litros\nMaterial: polietileno\nAltura: 0,66 m\nDiâmetro: 1,20 m'),
  ('EL-001', 'Cabo Flexível 2,5mm² 100m Azul', 'Elétrica', 'rolo', 21900, 12, 5, 'cabo.svg', 'cabo-flexivel', TRUE,
   'Cabo flexível para circuitos de tomadas de uso geral.',
   E'Seção: 2,5 mm²\nComprimento: 100 m\nTensão: 450/750 V\nCor: azul (neutro)'),
  ('EL-002', 'Cabo Flexível 4mm² 100m Preto', 'Elétrica', 'rolo', 33900, 6, 4, 'cabo.svg', 'cabo-flexivel', FALSE,
   'Cabo flexível para circuitos de chuveiro e ar-condicionado.',
   E'Seção: 4 mm²\nComprimento: 100 m\nTensão: 450/750 V\nCor: preto (fase)'),
  ('FE-002', 'Trena Emborrachada 5m', 'Ferramentas', 'un', 2490, 3, 5, 'trena.svg', NULL, FALSE,
   'Trena com fita de aço, trava e capa emborrachada.',
   E'Comprimento: 5 m\nLargura da fita: 19 mm\nTrava: sim'),
  ('TI-001', 'Tinta Acrílica Fosca Branco Neve 18L', 'Tintas e Acabamentos', 'lata', 28900, 14, 5, 'tinta.svg', NULL, FALSE,
   'Tinta acrílica fosca para paredes internas e externas.',
   E'Volume: 18 L\nAcabamento: fosco\nCor: branco neve\nRendimento: até 380 m² por demão')
) AS p(codigo, nome, categoria, unidade, preco, qtd, minimo, imagem, grupo, destaque, descricao, espec)
JOIN categorias c ON c.nome = p.categoria
ORDER BY p.codigo;

-- Estoque inicial no histórico (rastreabilidade desde o primeiro dia)
INSERT INTO movimentacoes (produto_id, tipo, quantidade, saldo_anterior, saldo_posterior, observacao, usuario_id)
SELECT p.id, 'entrada', p.quantidade, 0, p.quantidade, 'Estoque inicial (implantação do sistema)',
       (SELECT id FROM usuarios WHERE login = 'gerente')
FROM produtos p
WHERE p.quantidade > 0;
