// Página do produto: /produto/<código>
const ref = decodeURIComponent(location.pathname.split('/').pop() || '');
const campoQtd = document.getElementById('qtd');
let produto = null;

const TEXTO_SITUACAO = {
  disponivel: ['check', 'Disponível para retirada na loja'],
  ultimas: ['alerta', 'Últimas unidades em estoque'],
  esgotado: ['x', 'Esgotado no momento. Pergunte pela previsão de chegada'],
};

function quantidade() {
  const n = Math.floor(Number(campoQtd.value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 9999) : 1;
}

function atualizarWhatsApp() {
  const p = produto;
  document.getElementById('p-whatsapp').href = linkWhatsApp(
    `Olá! Gostaria de um orçamento de ${quantidade()} ${p.unidade} de ${p.codigo ? p.codigo + ' - ' : ''}${p.nome}.`
  );
}

function linhasEspecificacoes(texto) {
  const mapa = new Map();
  for (const l of String(texto || '').split('\n')) {
    const i = l.indexOf(':');
    if (i > 0) mapa.set(l.slice(0, i).trim(), l.slice(i + 1).trim());
  }
  return mapa;
}

/** Tabela "Não confunda": mostra lado a lado o que muda entre os produtos parecidos. */
function desenharComparacao(semelhantes) {
  const todos = [produto, ...semelhantes];
  const specs = todos.map((p) => linhasEspecificacoes(p.especificacoes));
  const chaves = [...new Set(specs.flatMap((m) => [...m.keys()]))]
    .filter((k) => new Set(specs.map((m) => m.get(k) || '—')).size > 1); // só o que é diferente
  const situacao = (p) => seloSituacao(p.situacao);
  document.getElementById('comparacao').innerHTML = `
    <table class="tabela-comparacao">
      <thead><tr><th scope="col"><span class="sr-only">Característica</span></th>
        ${todos.map((p, i) => `<th scope="col">${i === 0 ? esc(p.codigo || 'Este') + ' · este'
          : `<a href="${linkProduto(p)}">${esc(p.codigo || p.nome)}</a>`}</th>`).join('')}</tr></thead>
      <tbody>
        <tr><th scope="row">Produto</th>${todos.map((p) => `<td>${esc(p.nome)}</td>`).join('')}</tr>
        ${chaves.map((k) => `<tr><th scope="row">${esc(k)}</th>${specs.map((m) => `<td class="diferente">${esc(m.get(k) || '—')}</td>`).join('')}</tr>`).join('')}
        <tr><th scope="row">Preço</th>${todos.map((p) => `<td>${reais(p.preco_centavos)}</td>`).join('')}</tr>
        <tr><th scope="row">Estoque</th>${todos.map((p) => `<td>${situacao(p)}</td>`).join('')}</tr>
      </tbody>
    </table>`;
  document.getElementById('nao-confunda').classList.remove('oculto');
}

function desenhar({ produto: p, semelhantes, relacionados }) {
  produto = p;
  document.title = `${p.nome} | Dois Irmãos – Casa & Obra`;
  document.getElementById('trilha-produto').textContent = p.nome;
  const trilhaCat = document.getElementById('trilha-categoria');
  trilhaCat.textContent = p.categoria || 'Sem categoria';
  trilhaCat.href = p.categoria_id ? `/catalogo?categoria=${p.categoria_id}` : '/catalogo';

  const img = document.getElementById('p-imagem');
  img.src = p.imagem;
  img.alt = p.nome;
  document.getElementById('p-categoria').textContent = p.categoria || '';
  const codigo = document.getElementById('p-codigo');
  codigo.textContent = p.codigo ? `Código ${p.codigo}` : '';
  codigo.classList.toggle('oculto', !p.codigo);
  document.getElementById('p-nome').textContent = p.nome;
  document.getElementById('p-descricao').textContent = p.descricao || '';
  document.getElementById('p-preco').textContent = reais(p.preco_centavos);
  document.getElementById('p-unidade').textContent = `por ${p.unidade}`;

  const [ic, texto] = TEXTO_SITUACAO[p.situacao];
  const faixa = document.getElementById('p-situacao');
  faixa.className = `faixa-situacao ${p.situacao}`;
  faixa.innerHTML = `${icone(ic)} ${esc(texto)}`;

  document.getElementById('p-especificacoes').innerHTML =
    tabelaEspecificacoes(p.especificacoes).replace('class="especificacoes"', 'class="especificacoes grande"');

  if (semelhantes.length) desenharComparacao(semelhantes);
  else document.getElementById('nao-confunda').classList.add('oculto');

  document.getElementById('relacionados').classList.toggle('oculto', relacionados.length === 0);
  document.getElementById('grade-relacionados').innerHTML = relacionados.map(cardProduto).join('');
  atualizarWhatsApp();
}

async function carregar() {
  try {
    desenhar(await api('/api/catalogo/' + encodeURIComponent(ref)));
  } catch (erro) {
    document.getElementById('produto').classList.add('oculto');
    document.querySelector('.produto-detalhes').classList.add('oculto');
    document.getElementById('trilha-produto').textContent = 'Não encontrado';
    const caixa = document.getElementById('erro-produto');
    caixa.className = 'aviso aviso-erro';
    caixa.innerHTML = `${esc(erro.message)} <a href="/catalogo">Voltar ao catálogo</a>`;
  }
}

// Antes de abrir o WhatsApp, pede nome e CPF (o pedido fica registrado na loja)
document.getElementById('p-whatsapp').addEventListener('click', (e) => {
  if (!produto) return;
  e.preventDefault();
  const qtd = quantidade();
  const p = produto;
  pedirDadosEEnviar({
    itens: [{ produto_id: p.id, quantidade: qtd }],
    mensagem: (cliente) => mensagemDaLista([{ ...p, quantidade: qtd }], cliente),
  });
});

document.getElementById('menos').addEventListener('click', () => { campoQtd.value = Math.max(1, quantidade() - 1); atualizarWhatsApp(); });
document.getElementById('mais').addEventListener('click', () => { campoQtd.value = quantidade() + 1; atualizarWhatsApp(); });
campoQtd.addEventListener('input', () => produto && atualizarWhatsApp());
document.getElementById('p-lista').addEventListener('click', () => {
  if (!produto) return;
  adicionarNaLista(produto, quantidade());
  toast(`${produto.nome} adicionado à lista de orçamento.`, 'sucesso');
});

carregar();
ouvirTempoReal(['estoque'], carregar); // disponibilidade em tempo real
