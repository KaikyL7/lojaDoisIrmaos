// Lista de orçamento do cliente (guardada no navegador) enviada pelo WhatsApp.
// Ao enviar, o cliente informa nome e CPF e o pedido fica registrado nos orçamentos da loja.

function desenhar() {
  const lista = lerLista();
  document.getElementById('vazio').classList.toggle('oculto', lista.length > 0);
  document.getElementById('acoes-lista').classList.toggle('oculto', lista.length === 0);
  document.getElementById('itens').innerHTML = lista.map((i, n) => `
    <div class="item-lista">
      <img src="${esc(i.imagem)}" alt="">
      <div class="nome"><a href="${linkProduto(i)}"><strong>${esc(i.nome)}</strong></a><small>${i.codigo ? 'Código ' + esc(i.codigo) : ''}</small></div>
      <label class="sr-only" for="qtd-${n}">Quantidade de ${esc(i.nome)}</label>
      <input class="input-qtd" id="qtd-${n}" type="number" min="1" max="9999" value="${i.quantidade}" data-indice="${n}">
      <span>${esc(i.unidade)}</span>
      <button class="btn btn-pequeno btn-perigo" type="button" data-remover="${n}">Remover</button>
    </div>`).join('');
}

document.getElementById('enviar').addEventListener('click', () => {
  const lista = lerLista();
  if (!lista.length) return;
  pedirDadosEEnviar({
    itens: lista.map((i) => ({ produto_id: i.id, quantidade: i.quantidade })),
    mensagem: (cliente) => mensagemDaLista(lista, cliente),
    aoEnviar: () => { salvarLista([]); desenhar(); }, // o pedido já ficou registrado na loja
  });
});

document.getElementById('itens').addEventListener('change', (e) => {
  const n = e.target.dataset.indice;
  if (n === undefined) return;
  const lista = lerLista();
  lista[n].quantidade = Math.min(9999, Math.max(1, Math.floor(Number(e.target.value)) || 1));
  salvarLista(lista);
  desenhar();
});

document.getElementById('itens').addEventListener('click', (e) => {
  const b = e.target.closest('[data-remover]');
  if (!b) return;
  const lista = lerLista();
  lista.splice(Number(b.dataset.remover), 1);
  salvarLista(lista);
  desenhar();
});

document.getElementById('limpar').addEventListener('click', () => {
  if (confirm('Limpar toda a lista?')) { salvarLista([]); desenhar(); }
});

desenhar();
