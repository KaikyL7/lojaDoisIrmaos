// Página inicial: categorias e produtos em destaque vindos do banco

async function carregarCategorias() {
  const { categorias } = await api('/api/categorias');
  document.getElementById('categorias').innerHTML = categorias.map((c) => `
    <a class="cartao-categoria" href="/catalogo?categoria=${c.id}">
      ${icone(c.icone, 32)}
      <strong>${esc(c.nome)}</strong>
      <span>${esc(c.descricao || `${c.total} produtos`)}</span>
    </a>`).join('');
}

async function carregarDestaques() {
  let { produtos } = await api('/api/catalogo?destaque=1');
  if (produtos.length < 4) ({ produtos } = await api('/api/catalogo?disponivel=1'));
  document.getElementById('destaques').innerHTML = produtos.slice(0, 4).map(cardProduto).join('');
}

carregarCategorias().catch(() => {});
carregarDestaques().catch(() => {});
ouvirTempoReal(['estoque'], () => carregarDestaques().catch(() => {}));
