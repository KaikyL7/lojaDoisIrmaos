// =====================================================================
//  Funções do site público: ícones, cartões de produto e lista de orçamento
// =====================================================================

// Ícones de linha (desenhados em SVG, sem biblioteca externa)
const ICONES = {
  tijolo: '<path d="M3 5h18v14H3zM3 9.7h18M3 14.3h18M9 5v4.7M15 9.7v4.6M9 14.3V19"/>',
  gota: '<path d="M12 3s6 6.7 6 11a6 6 0 0 1-12 0c0-4.3 6-11 6-11z"/>',
  raio: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  ferramenta: '<path d="M14.5 6.5l3-3 3 3-3 3M17.5 3.5L9 12M9 12l-5.5 5.5a2.1 2.1 0 0 0 3 3L12 15M9 12l3 3"/>',
  rolo: '<rect x="4" y="3" width="14" height="6" rx="1.5"/><path d="M18 6h2v5h-8v3"/><rect x="10.5" y="14" width="3" height="7" rx="1"/>',
  piso: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/>',
  caixa: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  whatsapp: '<path d="M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  alerta: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
};

function icone(nome, tamanho = 20) {
  return `<svg class="icone" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ICONES.caixa}</svg>`;
}

/** Selo de disponibilidade do catálogo público (sem mostrar a quantidade exata). */
function seloSituacao(situacao) {
  if (situacao === 'esgotado') return '<span class="selo selo-esgotado">Esgotado</span>';
  if (situacao === 'ultimas') return '<span class="selo selo-ultimas">Últimas unidades</span>';
  return '<span class="selo selo-ok">Disponível</span>';
}

/** Primeiras especificações em uma linha: "25 mm (3/4") · 6 m" */
function resumoEspecificacoes(texto, quantas = 2) {
  return String(texto || '').split('\n').map((l) => l.split(':').slice(1).join(':').trim()).filter(Boolean)
    .slice(0, quantas).join(' · ');
}

function linkProduto(p) {
  return `/produto/${encodeURIComponent(p.codigo || p.id)}`;
}

/** Cartão de produto usado na página inicial, no catálogo e nos relacionados. */
function cardProduto(p) {
  return `
    <a class="card-produto" href="${linkProduto(p)}">
      <div class="foto"><img src="${esc(p.imagem)}" alt="${esc(p.nome)}" loading="lazy"></div>
      <div class="info">
        <span class="categoria">${esc(p.categoria || '')}${p.codigo ? ' · ' + esc(p.codigo) : ''}</span>
        <h3>${esc(p.nome)}</h3>
        <span class="resumo">${esc(resumoEspecificacoes(p.especificacoes))}</span>
        <div class="rodape-card">
          <span class="preco">${reais(p.preco_centavos)} <small>/ ${esc(p.unidade)}</small></span>
          ${seloSituacao(p.situacao)}
        </div>
      </div>
    </a>`;
}

function linkWhatsApp(mensagem) {
  return `https://wa.me/${LOJA.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}

// ---------------------------------------------------------------------
// Lista de orçamento do cliente (fica guardada só no navegador dele)
// ---------------------------------------------------------------------
const CHAVE_LISTA = 'dois-irmaos-lista';

function lerLista() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_LISTA) || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function salvarLista(lista) {
  try { localStorage.setItem(CHAVE_LISTA, JSON.stringify(lista)); } catch { /* navegador sem armazenamento */ }
  atualizarContadorLista();
}

function adicionarNaLista(p, quantidade) {
  const lista = lerLista();
  const item = lista.find((i) => i.codigo === p.codigo && i.id === p.id);
  if (item) item.quantidade += quantidade;
  else lista.push({ id: p.id, codigo: p.codigo, nome: p.nome, unidade: p.unidade, imagem: p.imagem, quantidade });
  salvarLista(lista);
}

function mensagemDaLista(lista) {
  return 'Olá! Gostaria de um orçamento destes produtos:\n' +
    lista.map((i) => `- ${i.quantidade} ${i.unidade} de ${i.codigo ? i.codigo + ' - ' : ''}${i.nome}`).join('\n');
}

function atualizarContadorLista() {
  const total = lerLista().length;
  document.querySelectorAll('[data-contador-lista]').forEach((el) => {
    el.textContent = total;
    el.classList.toggle('oculto', total === 0);
  });
}

// Campo de busca do cabeçalho leva ao catálogo
document.addEventListener('DOMContentLoaded', () => {
  atualizarContadorLista();
  document.querySelectorAll('[data-whatsapp]').forEach((a) => {
    a.href = linkWhatsApp('Olá! Vim pelo site da Dois Irmãos e gostaria de um atendimento.');
  });
  const params = new URLSearchParams(location.search);
  const campo = document.querySelector('.busca-topo input');
  if (campo && params.get('q') && location.pathname.startsWith('/catalogo')) campo.value = params.get('q');
});
