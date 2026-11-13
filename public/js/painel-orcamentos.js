// Lista de orçamentos com filtros
const filtros = document.getElementById('filtros');

async function carregar() {
  const params = new URLSearchParams();
  for (const [k, v] of new FormData(filtros)) if (v) params.set(k, v);
  const { orcamentos } = await api('/api/orcamentos?' + params);
  document.getElementById('lista').innerHTML = orcamentos.length ? orcamentos.map((o) => `
    <tr>
      <td><b>#${o.id}</b></td>
      <td><strong>${esc(o.cliente_nome)}</strong><br><small class="ajuda">${esc(o.cliente_telefone || '')}</small></td>
      <td>${dataHora(o.data_emissao)}</td>
      <td>${data(o.data_validade)}</td>
      <td class="num">${o.qtd_itens}</td>
      <td class="num"><b>${reais(o.total_centavos)}</b></td>
      <td>${seloOrcamento(o.situacao)}</td>
      <td>${esc(o.funcionario)}</td>
      <td class="acoes-tabela"><a class="btn btn-pequeno" href="/painel/orcamento.html?id=${o.id}">Abrir</a></td>
    </tr>`).join('') : '<tr><td colspan="9" class="vazio">Nenhum orçamento encontrado.</td></tr>';
}

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
}).catch(() => {});
