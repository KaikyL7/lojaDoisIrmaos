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

// Menu do topo acompanha a rolagem: "A loja" e "Contato" ficam dourados quando a seção está na tela
function marcarSecaoNoMenu() {
  const links = [...document.querySelectorAll('.menu-site a')];
  const secoes = ['sobre', 'contato'].map((id) => document.getElementById(id)).filter(Boolean);
  let atual = null;
  for (const secao of secoes) {
    if (secao.getBoundingClientRect().top <= window.innerHeight * 0.4) atual = secao.id;
  }
  // No fim da página, a última seção é a atual (mesmo que seja curta)
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
    atual = secoes.at(-1)?.id ?? atual;
  }
  for (const link of links) {
    const alvo = new URL(link.href).hash.slice(1);
    const marcado = atual ? alvo === atual : link.getAttribute('href') === '/';
    if (marcado) link.setAttribute('aria-current', atual ? 'location' : 'page');
    else link.removeAttribute('aria-current');
  }
}

window.addEventListener('scroll', marcarSecaoNoMenu, { passive: true });
window.addEventListener('resize', marcarSecaoNoMenu);
marcarSecaoNoMenu();
