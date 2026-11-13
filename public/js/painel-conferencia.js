// Conferência de estoque (físico x sistema) — somente gerente
const lista = document.getElementById('lista');
let produtos = [];
const contagens = new Map(); // produto_id -> { contado, justificativa }

function desenhar() {
  const termo = document.getElementById('c-busca').value.trim().toLowerCase();
  const cat = document.getElementById('c-categoria').value;
  const visiveis = produtos.filter((p) =>
    (!cat || String(p.categoria_id) === cat) &&
    (!termo || p.nome.toLowerCase().includes(termo) || (p.codigo || '').toLowerCase().includes(termo)));

  lista.innerHTML = visiveis.map((p) => {
    const c = contagens.get(p.id) || {};
    return `
      <tr data-id="${p.id}">
        <td>${celulaProduto(p)}</td>
        <td class="num"><b>${p.quantidade}</b> ${esc(p.unidade)}</td>
        <td class="num"><input class="input-contagem" type="number" min="0" step="1" data-campo="contado"
          value="${c.contado ?? ''}" aria-label="Contagem física de ${esc(p.nome)}"></td>
        <td class="num" data-diferenca></td>
        <td><input data-campo="justificativa" maxlength="300" value="${esc(c.justificativa || '')}"
          placeholder="Ex.: avaria, extravio, erro de lançamento" aria-label="Justificativa"></td>
      </tr>`;
  }).join('') || '<tr><td colspan="5" class="vazio">Nenhum produto encontrado.</td></tr>';
  lista.querySelectorAll('tr[data-id]').forEach(atualizarDiferenca);
}

function atualizarDiferenca(linha) {
  const p = produtos.find((x) => x.id === Number(linha.dataset.id));
  const c = contagens.get(p.id);
  const celula = linha.querySelector('[data-diferenca]');
  if (!c || c.contado === '' || c.contado === undefined) { celula.textContent = '—'; return; }
  const d = Number(c.contado) - p.quantidade;
  celula.innerHTML = d === 0 ? '<span class="selo selo-ok">Confere</span>'
    : `<span class="${d > 0 ? 'diferenca-pos' : 'diferenca-neg'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</span>`;
}

lista.addEventListener('input', (e) => {
  const linha = e.target.closest('tr[data-id]');
  if (!linha) return;
  const id = Number(linha.dataset.id);
  const c = contagens.get(id) || {};
  c[e.target.dataset.campo] = e.target.value;
  contagens.set(id, c);
  atualizarDiferenca(linha);
});

document.getElementById('filtros').addEventListener('input', desenhar);
document.getElementById('filtros').addEventListener('submit', (e) => e.preventDefault());

document.getElementById('btn-salvar').addEventListener('click', async () => {
  const itens = [...contagens.entries()]
    .filter(([, c]) => c.contado !== undefined && c.contado !== '')
    .map(([produto_id, c]) => ({ produto_id, quantidade_contada: Number(c.contado), justificativa: c.justificativa || '' }));
  const caixa = document.getElementById('conf-resultado');
  if (!itens.length) return toast('Informe a contagem física de pelo menos um produto.', 'erro');
  try {
    const r = await api('/api/conferencia', { metodo: 'POST', dados: { itens } });
    caixa.className = 'aviso aviso-sucesso';
    caixa.innerHTML = `<strong>Conferência registrada.</strong> ${r.conferidos} produto(s) conferido(s), ${r.ajustes.length} ajuste(s).
      ${r.ajustes.length ? '<ul>' + r.ajustes.map((a) => `<li>${esc(a.produto)}: ${a.saldo_anterior} → <b>${a.saldo_posterior}</b></li>`).join('') + '</ul>' : ''}`;
    contagens.clear();
    await carregar();
  } catch (erro) {
    mostrarErro(caixa, erro);
  }
  caixa.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

async function carregar() {
  ({ produtos } = await api('/api/produtos'));
  desenhar();
}

iniciarPainel({ somenteGerente: true }).then(async () => {
  const { categorias } = await api('/api/categorias');
  document.getElementById('c-categoria').innerHTML += categorias.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  await carregar();
  ouvirTempoReal(['estoque'], carregar); // saldos sempre atualizados durante a contagem
}).catch(() => {});
