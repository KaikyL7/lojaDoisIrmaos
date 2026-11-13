// Visualização, impressão, renovação, venda e cancelamento de um orçamento
const id = Number(new URLSearchParams(location.search).get('id'));
const areaAcoes = document.getElementById('acoes');
const caixaAviso = document.getElementById('aviso');

function aviso(html, tipo) {
  caixaAviso.className = `aviso aviso-${tipo} nao-imprimir`;
  caixaAviso.innerHTML = html;
}

async function carregar() {
  const { orcamento: o, itens } = await api('/api/orcamentos/' + id);
  document.title = `Orçamento #${o.id} – ${o.cliente_nome} | Loja Dois Irmãos`;

  const emAberto = o.situacao === 'emitido';
  const semEstoque = itens.filter((i) => i.quantidade > i.estoque_atual);
  const precoMudou = itens.filter((i) => i.preco_atual_centavos !== i.preco_unitario_centavos);

  // Avisos para o funcionário (não aparecem na impressão)
  caixaAviso.classList.add('oculto');
  if (o.situacao === 'expirado') {
    aviso(`<strong>Orçamento expirado em ${data(o.data_validade)}.</strong> Para renovar, o sistema confere novamente
      os preços e a disponibilidade atuais.${precoMudou.length ? ` ${precoMudou.length} item(ns) mudaram de preço desde a emissão.` : ''}`, 'erro');
  } else if (emAberto && semEstoque.length) {
    aviso(`<strong>Atenção:</strong> o estoque mudou desde a emissão e não há quantidade suficiente de:
      <ul>${semEstoque.map((i) => `<li>${esc(i.produto_nome)} (disponível: ${i.estoque_atual})</li>`).join('')}</ul>`, 'erro');
  } else if (o.renovado_para) {
    aviso(`Este orçamento foi renovado. <a href="/painel/orcamento.html?id=${o.renovado_para}">Abrir orçamento #${o.renovado_para}</a>`, 'info');
  } else if (o.renovado_de) {
    aviso(`Renovação do <a href="/painel/orcamento.html?id=${o.renovado_de}">orçamento #${o.renovado_de}</a>, com preços e estoque conferidos novamente.`, 'info');
  }

  areaAcoes.innerHTML = `
    <button class="btn" type="button" data-acao="imprimir">Imprimir / salvar PDF</button>
    ${o.cliente_telefone ? '<button class="btn" type="button" data-acao="whatsapp">Enviar por WhatsApp</button>' : ''}
    ${o.situacao === 'expirado' ? '<button class="btn btn-primario" type="button" data-acao="renovar">Renovar orçamento</button>' : ''}
    ${emAberto ? '<button class="btn btn-sucesso" type="button" data-acao="converter">Finalizar venda (baixa no estoque)</button>' : ''}
    ${emAberto || o.situacao === 'expirado' ? '<button class="btn btn-perigo" type="button" data-acao="cancelar">Cancelar</button>' : ''}`;

  document.getElementById('conteudo-orcamento').innerHTML = `
    <h2>Orçamento nº ${o.id} ${seloOrcamento(o.situacao)}</h2>
    <div class="meta">
      <div><span>Cliente</span>${esc(o.cliente_nome)}</div>
      ${o.cliente_telefone ? `<div><span>Telefone</span>${esc(o.cliente_telefone)}</div>` : ''}
      ${o.cliente_documento ? `<div><span>CPF / CNPJ</span>${esc(o.cliente_documento)}</div>` : ''}
      <div><span>Data de emissão</span>${dataHora(o.data_emissao)}</div>
      <div><span>Válido até</span>${data(o.data_validade)}</div>
      <div><span>Atendente</span>${esc(o.funcionario)}</div>
    </div>
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead>
          <tr><th>Código</th><th>Produto</th><th class="num">Qtd.</th><th>Un.</th><th class="num">Preço unit.</th><th class="num">Total do item</th></tr>
        </thead>
        <tbody>${itens.map((i) => `
          <tr>
            <td>${esc(i.produto_codigo || '—')}</td>
            <td>${esc(i.produto_nome)}</td>
            <td class="num">${i.quantidade}</td>
            <td>${esc(i.unidade)}</td>
            <td class="num">${reais(i.preco_unitario_centavos)}</td>
            <td class="num">${reais(i.subtotal_centavos)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="5">Valor total do orçamento</td><td class="num">${reais(o.total_centavos)}</td></tr></tfoot>
      </table>
    </div>
    ${o.observacoes ? `<p><b>Observações:</b> ${esc(o.observacoes)}</p>` : ''}
    <p class="observacao-final">Preços válidos até ${data(o.data_validade)}. Após essa data, preços e disponibilidade
      serão conferidos novamente. Orçamento sujeito à disponibilidade de estoque no momento da compra.</p>`;

  return o;
}

let orcamento = null;

areaAcoes.addEventListener('click', async (e) => {
  const acao = e.target.closest('[data-acao]')?.dataset.acao;
  if (!acao) return;
  try {
    if (acao === 'imprimir') return window.print();
    if (acao === 'whatsapp') {
      const numero = '55' + orcamento.cliente_telefone.replace(/\D/g, '').replace(/^55/, '');
      const texto = `Olá, ${orcamento.cliente_nome}! Segue o orçamento nº ${orcamento.id} da ${LOJA.nome}: ` +
        `total de ${reais(orcamento.total_centavos)}, válido até ${data(orcamento.data_validade)}.`;
      return window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    }
    if (acao === 'renovar') {
      const { id: novo } = await api(`/api/orcamentos/${id}/renovar`, { metodo: 'POST', dados: {} });
      location.href = '/painel/orcamento.html?id=' + novo;
      return;
    }
    if (acao === 'converter') {
      if (!confirm('Confirmar a venda? A saída de todos os itens será registrada no estoque.')) return;
      await api(`/api/orcamentos/${id}/converter`, { metodo: 'POST', dados: {} });
      toast('Venda registrada e estoque atualizado.', 'sucesso');
    }
    if (acao === 'cancelar') {
      if (!confirm('Cancelar este orçamento?')) return;
      await api(`/api/orcamentos/${id}/cancelar`, { metodo: 'POST', dados: {} });
      toast('Orçamento cancelado.');
    }
    orcamento = await carregar();
  } catch (erro) {
    const div = document.createElement('div');
    mostrarErro(div, erro);
    caixaAviso.className = div.className + ' nao-imprimir';
    caixaAviso.innerHTML = div.innerHTML;
    caixaAviso.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

document.body.dataset.menu = 'orcamentos.html';
iniciarPainel().then(async () => {
  orcamento = await carregar();
  ouvirTempoReal(['estoque'], async () => { orcamento = await carregar(); });
}).catch((erro) => {
  if (erro.status === 404) document.getElementById('conteudo-orcamento').innerHTML = '<p class="vazio">Orçamento não encontrado.</p>';
});
