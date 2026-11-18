// Catálogo: busca, filtro por categoria e disponibilidade, ordenação.
// Os filtros ficam no endereço da página (dá para mandar o link já filtrado).
const grade = document.getElementById('grade');
const listaCategorias = document.getElementById('categorias');
const campoBusca = document.getElementById('busca');
const campoOrdem = document.getElementById('ordem');
const soDisponiveis = document.getElementById('so-disponiveis');

const params = new URLSearchParams(location.search);
const filtro = {
  q: params.get('q') || '',
  categoria: params.get('categoria') || '',
  ordem: params.get('ordem') || '',
  disponivel: params.get('disponivel') === '1',
};
let categorias = [];

function atualizarEndereco() {
  const p = new URLSearchParams();
  if (filtro.q) p.set('q', filtro.q);
  if (filtro.categoria) p.set('categoria', filtro.categoria);
  if (filtro.ordem) p.set('ordem', filtro.ordem);
  if (filtro.disponivel) p.set('disponivel', '1');
  history.replaceState(null, '', '/catalogo' + (p.toString() ? '?' + p : ''));
}

function desenharCategorias() {
  const total = categorias.reduce((s, c) => s + c.total, 0);
  listaCategorias.innerHTML =
    `<li><button type="button" data-categoria="" aria-pressed="${!filtro.categoria}">Todas <span class="total">${total}</span></button></li>` +
    categorias.filter((c) => c.total > 0).map((c) => `
      <li><button type="button" data-categoria="${c.id}" aria-pressed="${String(c.id) === filtro.categoria}">
        ${esc(c.nome)} <span class="total">${c.total}</span></button></li>`).join('');
  const atual = categorias.find((c) => String(c.id) === filtro.categoria);
  document.getElementById('titulo-catalogo').textContent = atual ? atual.nome : 'Catálogo de produtos';
  document.getElementById('trilha-atual').textContent = atual ? atual.nome : 'Catálogo';
  document.title = `${atual ? atual.nome : 'Catálogo de produtos'} | Dois Irmãos – Casa & Obra`;
}

async function carregarProdutos() {
  const p = new URLSearchParams();
  if (filtro.q) p.set('q', filtro.q);
  if (filtro.categoria) p.set('categoria', filtro.categoria);
  if (filtro.ordem) p.set('ordem', filtro.ordem);
  if (filtro.disponivel) p.set('disponivel', '1');
  try {
    const { produtos } = await api('/api/catalogo?' + p);
    grade.innerHTML = produtos.map(cardProduto).join('');
    document.getElementById('vazio').classList.toggle('oculto', produtos.length > 0);
    document.getElementById('contador').textContent =
      `${produtos.length} ${produtos.length === 1 ? 'produto encontrado' : 'produtos encontrados'}` +
      (filtro.q ? ` para "${filtro.q}"` : '');
  } catch (e) {
    grade.innerHTML = `<div class="aviso aviso-erro">${esc(e.message)}</div>`;
  }
}

listaCategorias.addEventListener('click', (e) => {
  const b = e.target.closest('[data-categoria]');
  if (!b) return;
  filtro.categoria = b.dataset.categoria;
  desenharCategorias();
  atualizarEndereco();
  carregarProdutos();
});

let espera;
campoBusca.addEventListener('input', () => {
  clearTimeout(espera);
  espera = setTimeout(() => {
    filtro.q = campoBusca.value.trim();
    atualizarEndereco();
    carregarProdutos();
  }, 300);
});
document.getElementById('barra').addEventListener('submit', (e) => e.preventDefault());
campoOrdem.addEventListener('change', () => { filtro.ordem = campoOrdem.value; atualizarEndereco(); carregarProdutos(); });
soDisponiveis.addEventListener('change', () => { filtro.disponivel = soDisponiveis.checked; atualizarEndereco(); carregarProdutos(); });

campoBusca.value = filtro.q;
campoOrdem.value = filtro.ordem;
soDisponiveis.checked = filtro.disponivel;

api('/api/categorias').then((r) => { categorias = r.categorias; desenharCategorias(); }).catch(() => {});
carregarProdutos();
ouvirTempoReal(['estoque'], carregarProdutos); // disponibilidade sempre atualizada
