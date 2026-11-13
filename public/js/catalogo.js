// Catálogo público: busca, filtro por categoria e detalhes do produto
const grade = document.getElementById('grade');
const areaCategorias = document.getElementById('categorias');
const campoBusca = document.getElementById('busca');
const janela = document.getElementById('janela-produto');

let produtos = [];
let categoriaAtual = '';

async function carregarCategorias() {
  const { categorias } = await api('/api/categorias');
  const comProdutos = categorias.filter((c) => c.total > 0);
  areaCategorias.innerHTML =
    `<button class="chip" type="button" data-categoria="" aria-pressed="true">Todos</button>` +
    comProdutos.map((c) => `<button class="chip" type="button" data-categoria="${c.id}" aria-pressed="false">${esc(c.nome)}</button>`).join('');
}

async function carregarProdutos() {
  const params = new URLSearchParams();
  if (campoBusca.value.trim()) params.set('q', campoBusca.value.trim());
  if (categoriaAtual) params.set('categoria', categoriaAtual);
  try {
    ({ produtos } = await api('/api/catalogo?' + params));
    desenhar();
  } catch (e) {
    grade.innerHTML = `<div class="aviso aviso-erro">${esc(e.message)}</div>`;
  }
}

function desenhar() {
  document.getElementById('vazio').classList.toggle('oculto', produtos.length > 0);
  document.getElementById('contador').textContent =
    produtos.length === 1 ? '1 produto' : `${produtos.length} produtos`;
  grade.innerHTML = produtos.map((p) => `
    <button class="card-produto" type="button" data-id="${p.id}">
      <img src="${esc(p.imagem)}" alt="${esc(p.nome)}" loading="lazy">
      <div class="info">
        <span class="categoria">${esc(p.categoria || '')}</span>
        <h3>${esc(p.nome)}</h3>
        ${p.codigo ? `<span class="codigo">Código: ${esc(p.codigo)}</span>` : ''}
        <div class="rodape-card">
          <span class="preco">${reais(p.preco_centavos)} <small>/ ${esc(p.unidade)}</small></span>
          ${p.disponivel ? '<span class="selo selo-ok">Disponível</span>' : '<span class="selo selo-esgotado">Esgotado</span>'}
        </div>
      </div>
    </button>`).join('');
}

function abrirProduto(id) {
  const p = produtos.find((x) => x.id === id);
  if (!p) return;
  document.getElementById('titulo-produto').textContent = p.nome;
  const mensagem = encodeURIComponent(
    `Olá! Gostaria de um orçamento do produto ${p.codigo ? p.codigo + ' - ' : ''}${p.nome}.`
  );
  document.getElementById('corpo-produto').innerHTML = `
    <div class="detalhe-produto">
      <img src="${esc(p.imagem)}" alt="${esc(p.nome)}">
      <div>
        <p class="categoria">${esc(p.categoria || '')}${p.codigo ? ' · Código ' + esc(p.codigo) : ''}</p>
        <p class="preco">${reais(p.preco_centavos)} <small>por ${esc(p.unidade)}</small></p>
        <p>${p.disponivel ? '<span class="selo selo-ok">Disponível em estoque</span>' : '<span class="selo selo-esgotado">Esgotado no momento</span>'}</p>
        <p>${esc(p.descricao || '')}</p>
        <a class="btn btn-escuro" href="https://wa.me/${LOJA.whatsapp}?text=${mensagem}" target="_blank" rel="noopener">
          Pedir orçamento pelo WhatsApp
        </a>
      </div>
    </div>
    <h3 class="titulo-espec">Especificações técnicas</h3>
    ${tabelaEspecificacoes(p.especificacoes)}`;
  janela.showModal();
}

// Eventos -----------------------------------------------------------------
grade.addEventListener('click', (e) => {
  const card = e.target.closest('[data-id]');
  if (card) abrirProduto(Number(card.dataset.id));
});

areaCategorias.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-categoria]');
  if (!chip) return;
  categoriaAtual = chip.dataset.categoria;
  areaCategorias.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
  carregarProdutos();
});

document.getElementById('form-busca').addEventListener('submit', (e) => {
  e.preventDefault();
  carregarProdutos();
  document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
});

let esperaBusca;
campoBusca.addEventListener('input', () => {
  clearTimeout(esperaBusca);
  esperaBusca = setTimeout(carregarProdutos, 300);
});

janela.addEventListener('click', (e) => {
  if (e.target === janela || e.target.closest('[data-fechar]')) janela.close();
});

// Disponibilidade em tempo real
ouvirTempoReal(['estoque'], carregarProdutos);

carregarCategorias().then(carregarProdutos);
