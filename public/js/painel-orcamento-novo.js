// Montagem de orçamento com verificação de estoque em tempo real
const campoBusca = document.getElementById('o-busca');
const areaResultados = document.getElementById('resultados');
const corpoItens = document.getElementById('itens');
const formOrc = document.getElementById('form-orc');

let produtos = [];
const itens = new Map(); // produto_id -> quantidade

function produto(id) {
  return produtos.find((p) => p.id === id);
}

function desenharResultados() {
  const termo = campoBusca.value.trim().toLowerCase();
  const filtrados = produtos.filter((p) => !termo ||
    [p.nome, p.codigo, p.especificacoes, p.descricao].some((t) => (t || '').toLowerCase().includes(termo)));

  areaResultados.innerHTML = filtrados.map((p) => {
    const esgotado = p.quantidade === 0;
    const espec = (p.especificacoes || '').split('\n').slice(0, 2).join(' · ');
    return `
      <div class="resultado ${esgotado ? 'esgotado' : ''}">
        ${celulaProduto(p, espec ? ' · ' + esc(espec) : '')}
        <div class="num">
          <div class="preco">${reais(p.preco_centavos)}</div>
          <small class="ajuda">${esgotado ? 'Esgotado' : `Disp.: ${p.quantidade} ${esc(p.unidade)}`}</small>
        </div>
        <button class="btn btn-pequeno ${esgotado ? '' : 'btn-escuro'}" type="button" data-adicionar="${p.id}"
          ${esgotado ? 'disabled title="Produto esgotado"' : ''}>${itens.has(p.id) ? '+1' : 'Adicionar'}</button>
      </div>`;
  }).join('') || '<p class="vazio">Nenhum produto encontrado.</p>';
}

function desenharItens(problemas = []) {
  const comProblema = new Set(problemas.map((x) => x.produto_id));
  let total = 0;
  corpoItens.innerHTML = [...itens.entries()].map(([id, qtd]) => {
    const p = produto(id);
    if (!p) return '';
    const subtotal = p.preco_centavos * qtd;
    total += subtotal;
    const acima = qtd > p.quantidade;
    return `
      <tr class="${acima || comProblema.has(id) ? 'linha-alerta' : ''}" data-id="${id}">
        <td><strong>${esc(p.nome)}</strong><br><small class="ajuda">${esc(p.codigo || '')} · disponível: ${p.quantidade} ${esc(p.unidade)}</small>
          ${acima ? '<br><small class="diferenca-neg">Quantidade acima do estoque</small>' : ''}</td>
        <td class="num"><input class="input-qtd" type="number" min="1" max="${p.quantidade}" step="1" value="${qtd}" aria-label="Quantidade"></td>
        <td class="num">${reais(p.preco_centavos)}</td>
        <td class="num"><b>${reais(subtotal)}</b></td>
        <td class="acoes-tabela"><button class="btn btn-pequeno btn-perigo" type="button" data-remover="${id}" aria-label="Remover">✕</button></td>
      </tr>`;
  }).join('') || '<tr><td colspan="5" class="vazio">Nenhum produto adicionado.</td></tr>';
  document.getElementById('total').textContent = reais(total);
}

async function carregarProdutos() {
  ({ produtos } = await api('/api/produtos'));
  // Remove itens que deixaram de existir/ficaram inativos
  for (const id of itens.keys()) if (!produto(id)) itens.delete(id);
  desenharResultados();
  desenharItens();
}

areaResultados.addEventListener('click', (e) => {
  const b = e.target.closest('[data-adicionar]');
  if (!b) return;
  const id = Number(b.dataset.adicionar);
  const p = produto(id);
  const nova = (itens.get(id) || 0) + 1;
  if (nova > p.quantidade) return toast(`Só há ${p.quantidade} ${p.unidade} de ${p.nome} em estoque.`, 'erro');
  itens.set(id, nova);
  desenharItens();
  desenharResultados();
});

corpoItens.addEventListener('input', (e) => {
  const linha = e.target.closest('tr[data-id]');
  if (!linha || !e.target.matches('.input-qtd')) return;
  const qtd = Math.max(1, Math.floor(Number(e.target.value) || 1));
  itens.set(Number(linha.dataset.id), qtd);
});
corpoItens.addEventListener('change', () => desenharItens());

corpoItens.addEventListener('click', (e) => {
  const b = e.target.closest('[data-remover]');
  if (!b) return;
  itens.delete(Number(b.dataset.remover));
  desenharItens();
  desenharResultados();
});

let espera;
campoBusca.addEventListener('input', () => {
  clearTimeout(espera);
  espera = setTimeout(desenharResultados, 150);
});

formOrc.addEventListener('submit', async (e) => {
  e.preventDefault();
  const caixa = document.getElementById('orc-erro');
  caixa.classList.add('oculto');
  const dados = dadosFormulario(formOrc);
  dados.itens = [...itens.entries()].map(([produto_id, quantidade]) => ({ produto_id, quantidade }));
  const botao = document.getElementById('btn-emitir');
  botao.disabled = true;
  try {
    const { id } = await api('/api/orcamentos', { metodo: 'POST', dados });
    location.href = '/painel/orcamento.html?id=' + id;
  } catch (erro) {
    mostrarErro(caixa, erro);
    if (erro.detalhes) desenharItens(erro.detalhes);
    caixa.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } finally {
    botao.disabled = false;
  }
});

iniciarPainel().then(async () => {
  await carregarProdutos();
  campoBusca.focus();
  // Se alguém vender o item enquanto o orçamento é montado, a tela avisa na hora
  ouvirTempoReal(['estoque'], carregarProdutos);
}).catch(() => {});
