// Lista de orçamentos com filtros
const filtros = document.getElementById('filtros');

async function carregar() {
  const params = new URLSearchParams();
  for (const [k, v] of new FormData(filtros)) if (v) params.set(k, v);
  const { orcamentos } = await api('/api/orcamentos?' + params);
  document.getElementById('lista').innerHTML = orcamentos.length ? orcamentos.map((o) => `
    <tr>
      <td><b>#${o.id}</b></td>
      <td><strong>${esc(o.cliente_nome)}</strong><br><small class="ajuda">${esc([o.cliente_documento && 'CPF/CNPJ ' + o.cliente_documento, o.cliente_telefone].filter(Boolean).join(' · '))}</small>${o.pedido_site_id ? `<br><small class="ajuda">Pedido do site #${o.pedido_site_id}</small>` : ''}</td>
      <td>${dataHora(o.data_emissao)}</td>
      <td>${data(o.data_validade)}</td>
      <td class="num">${o.qtd_itens}</td>
      <td class="num"><b>${reais(o.total_centavos)}</b></td>
      <td>${seloOrcamento(o.situacao)}</td>
      <td>${esc(o.funcionario)}</td>
      <td class="acoes-tabela"><a class="btn btn-pequeno" href="/painel/orcamento.html?id=${o.id}">Abrir</a></td>
    </tr>`).join('') : '<tr><td colspan="9" class="vazio">Nenhum orçamento encontrado.</td></tr>';
}

// Pedidos que os clientes fizeram pelo site e ainda não viraram orçamento
let pedidos = [];

async function carregarPedidos() {
  ({ pedidos } = await api('/api/pedidos-site?status=novo'));
  document.getElementById('pedidos-site').classList.toggle('oculto', pedidos.length === 0);
  document.getElementById('lista-pedidos').innerHTML = pedidos.map((p) => `
    <tr>
      <td><b>#${p.id}</b><br><small class="ajuda">${dataHora(p.data)}</small></td>
      <td><strong>${esc(p.cliente_nome)}</strong><br><small class="ajuda">CPF ${esc(p.cliente_cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'))}</small></td>
      <td><ul class="itens-pedido">${p.itens.map((i) =>
        `<li>${i.quantidade} ${esc(i.unidade)} · ${i.codigo ? esc(i.codigo) + ' – ' : ''}${esc(i.nome)}</li>`).join('')}</ul></td>
      <td class="acoes-tabela">
        <a class="btn btn-pequeno btn-escuro" href="/painel/orcamento-novo.html?pedido=${p.id}">Gerar orçamento</a>
        <button class="btn btn-pequeno" type="button" data-dispensar="${p.id}">Dispensar</button>
      </td>
    </tr>`).join('');
}

document.getElementById('lista-pedidos').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-dispensar]');
  if (!b) return;
  const p = pedidos.find((x) => x.id === Number(b.dataset.dispensar));
  if (!confirm(`Dispensar o pedido #${p.id} de ${p.cliente_nome} sem gerar orçamento?`)) return;
  try {
    await api(`/api/pedidos-site/${p.id}/atender`, { metodo: 'POST' });
    toast('Pedido dispensado.', 'sucesso');
    carregarPedidos();
  } catch (erro) {
    toast(erro.message, 'erro');
  }
});

let espera;
filtros.addEventListener('input', () => {
  clearTimeout(espera);
  espera = setTimeout(carregar, 250);
});
filtros.addEventListener('submit', (e) => e.preventDefault());

iniciarPainel().then(() => {
  const situacao = new URLSearchParams(location.search).get('situacao');
  if (situacao) document.getElementById('f-situacao').value = situacao;
  carregar();
  carregarPedidos();
  // Pedido novo chegando pelo site aparece sozinho
  ouvirTempoReal(['pedido'], () => { carregarPedidos(); carregar(); });
}).catch(() => {});
