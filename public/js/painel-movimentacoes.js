// Entradas, saídas e histórico de movimentações
const formMov = document.getElementById('form-mov');
const selProduto = document.getElementById('m-produto');
const filtros = document.getElementById('filtros');
let produtos = [];

function tipoAtual() {
  return formMov.querySelector('[name=tipo]:checked').value;
}

function atualizarFormulario() {
  const entrada = tipoAtual() === 'entrada';
  document.getElementById('m-enviar').textContent = entrada ? 'Registrar entrada' : 'Registrar saída';
  document.getElementById('m-obs-rotulo').textContent = entrada ? 'Nota fiscal / fornecedor' : 'Motivo / cliente / nº da venda';
  const p = produtos.find((x) => x.id === Number(selProduto.value));
  const info = document.getElementById('m-info');
  if (!p) return info.classList.add('oculto');
  info.classList.remove('oculto');
  info.innerHTML = `Saldo atual: <strong>${p.quantidade} ${esc(p.unidade)}</strong> ${seloEstoque(p)}`;
  document.getElementById('m-qtd').max = entrada ? '' : String(p.quantidade);
}

async function carregarProdutos() {
  const valor = selProduto.value;
  produtos = await preencherSelectProdutos(selProduto, { valorAtual: valor });
  const filtroProduto = document.getElementById('h-produto');
  const valorFiltro = filtroProduto.value;
  filtroProduto.innerHTML = '<option value="">Todos</option>' + produtos.map((p) =>
    `<option value="${p.id}">${esc((p.codigo ? p.codigo + ' – ' : '') + p.nome)}</option>`).join('');
  filtroProduto.value = valorFiltro;
  atualizarFormulario();
}

async function carregarHistorico() {
  const params = new URLSearchParams();
  for (const [k, v] of new FormData(filtros)) if (v) params.set(k, v);
  const { movimentacoes } = await api('/api/movimentacoes?' + params);
  document.getElementById('historico').innerHTML = movimentacoes.length ? movimentacoes.map((m) => `
    <tr>
      <td>${dataHora(m.data)}</td>
      <td><strong>${esc(m.produto)}</strong><br><small class="ajuda">${esc(m.codigo || '')}</small></td>
      <td>${rotuloTipo(m.tipo)}</td>
      <td class="num">${variacao(m)}</td>
      <td class="num">${m.saldo_anterior} → <b>${m.saldo_posterior}</b></td>
      <td>${esc(m.funcionario)}</td>
      <td>${esc(m.observacao || '')}${m.orcamento_id ? ` <a href="/painel/orcamento.html?id=${m.orcamento_id}">ver orçamento</a>` : ''}</td>
    </tr>`).join('') : '<tr><td colspan="7" class="vazio">Nenhuma movimentação encontrada.</td></tr>';
}

formMov.addEventListener('change', atualizarFormulario);

formMov.addEventListener('submit', async (e) => {
  e.preventDefault();
  const caixaErro = document.getElementById('mov-erro');
  caixaErro.classList.add('oculto');
  const tipo = tipoAtual();
  const dados = dadosFormulario(formMov);
  const botao = document.getElementById('m-enviar');
  botao.disabled = true;
  try {
    const r = await api('/api/movimentacoes/' + tipo, { metodo: 'POST', dados });
    toast(`${tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada. Novo saldo de ${r.produto}: ${r.saldo_posterior}.`, 'sucesso');
    formMov.quantidade.value = '';
    formMov.observacao.value = '';
    // o tempo real recarrega produtos e histórico
  } catch (erro) {
    mostrarErro(caixaErro, erro);
  } finally {
    botao.disabled = false;
  }
});

filtros.addEventListener('input', carregarHistorico);

iniciarPainel().then(async (usuario) => {
  document.getElementById('m-funcionario').textContent = usuario.nome;
  const params = new URLSearchParams(location.search);
  await carregarProdutos();
  if (params.get('produto')) { selProduto.value = params.get('produto'); atualizarFormulario(); }
  if (params.get('historico')) document.getElementById('h-produto').value = params.get('historico');
  await carregarHistorico();
  ouvirTempoReal(['estoque'], () => { carregarProdutos(); carregarHistorico(); });
}).catch(() => {});
