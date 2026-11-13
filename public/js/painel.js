// =====================================================================
//  Estrutura comum do painel: menu lateral, usuário logado e permissões
//  Cada página chama:  iniciarPainel().then((usuario) => { ... })
// =====================================================================

const MENU = [
  { grupo: 'Estoque' },
  { href: 'index.html', texto: 'Início' },
  { href: 'estoque.html', texto: 'Produtos e estoque' },
  { href: 'movimentacoes.html', texto: 'Entradas e saídas' },
  { href: 'devolucoes.html', texto: 'Devoluções', contador: 'devolucoes' },
  { href: 'conferencia.html', texto: 'Conferência de estoque', gerente: true },
  { grupo: 'Atendimento' },
  { href: 'orcamento-novo.html', texto: 'Novo orçamento' },
  { href: 'orcamentos.html', texto: 'Orçamentos' },
  { grupo: 'Administração', gerente: true },
  { href: 'funcionarios.html', texto: 'Funcionários', gerente: true },
  { separador: true },
  { href: '/', texto: 'Ver catálogo do site ↗', externo: true },
];

let USUARIO = null;
const ehGerente = () => USUARIO && USUARIO.perfil === 'gerente';

function montarMenu() {
  const paginaAtual = location.pathname.split('/').pop() || 'index.html';
  const atual = document.body.dataset.menu || paginaAtual;

  const itens = MENU.filter((i) => !i.gerente || ehGerente()).map((i) => {
    if (i.grupo) return `<div class="grupo">${esc(i.grupo)}</div>`;
    if (i.separador) return '<div class="separador"></div>';
    const href = i.externo ? i.href : '/painel/' + i.href;
    const ativo = i.href === atual ? ' aria-current="page"' : '';
    const contador = i.contador ? `<span class="contador-menu oculto" data-contador="${i.contador}"></span>` : '';
    return `<a href="${href}"${ativo}${i.externo ? ' target="_blank" rel="noopener"' : ''}><span>${esc(i.texto)}</span>${contador}</a>`;
  });

  const aside = document.createElement('aside');
  aside.className = 'menu-lateral';
  aside.id = 'menu';
  aside.innerHTML = `
    <a class="logo-menu" href="/painel/index.html"><img src="/img/logo-horizontal.jpg" alt="Dois Irmãos – Casa & Obra"></a>
    <nav aria-label="Menu do painel">${itens.join('')}</nav>
    <div class="usuario-menu">
      <strong>${esc(USUARIO.nome)}</strong>
      <span class="perfil">${USUARIO.perfil === 'gerente' ? 'Gerente' : 'Atendente'}</span>
      <button class="btn btn-pequeno" type="button" id="btn-sair">Sair</button>
    </div>`;

  const barra = document.createElement('div');
  barra.className = 'barra-movel';
  barra.innerHTML = `<img src="/img/logo-horizontal.jpg" alt="Dois Irmãos – Casa & Obra">
    <button class="btn btn-pequeno" type="button" id="btn-menu" aria-controls="menu" aria-expanded="false">☰ Menu</button>`;

  const layout = document.querySelector('.layout');
  layout.prepend(aside);
  document.body.prepend(barra);

  document.getElementById('btn-sair').addEventListener('click', async () => {
    await api('/api/auth/logout', { metodo: 'POST' }).catch(() => {});
    location.href = '/login.html';
  });
  const btnMenu = document.getElementById('btn-menu');
  btnMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    const aberto = document.body.classList.toggle('menu-aberto');
    btnMenu.setAttribute('aria-expanded', String(aberto));
  });
  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('menu-aberto') && !e.target.closest('#menu')) {
      document.body.classList.remove('menu-aberto');
      btnMenu.setAttribute('aria-expanded', 'false');
    }
  });
}

async function atualizarContadores() {
  try {
    const { devolucoes } = await api('/api/devolucoes?status=pendente');
    const el = document.querySelector('[data-contador="devolucoes"]');
    if (el) {
      el.textContent = devolucoes.length;
      el.classList.toggle('oculto', devolucoes.length === 0);
    }
  } catch { /* sem contador */ }
}

/** Esconde elementos marcados com data-gerente para quem não é gerente. */
function aplicarPermissoes(raiz = document) {
  if (!ehGerente()) raiz.querySelectorAll('[data-gerente]').forEach((el) => el.classList.add('oculto'));
}

async function iniciarPainel({ somenteGerente = false } = {}) {
  ({ usuario: USUARIO } = await api('/api/auth/eu'));
  if (somenteGerente && !ehGerente()) {
    document.querySelector('.conteudo').innerHTML = `
      <div class="aviso aviso-erro"><strong>Acesso restrito.</strong>
      Esta área é exclusiva para funcionários com perfil Gerente.</div>`;
    montarMenu();
    throw new Error('sem permissão');
  }
  montarMenu();
  aplicarPermissoes();
  atualizarContadores();
  ouvirTempoReal(['devolucao', 'estoque'], atualizarContadores);
  return USUARIO;
}

// ---------------------------------------------------------------------
// Utilidades para janelas (dialog) e formulários
// ---------------------------------------------------------------------
function ligarJanela(dialog) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-fechar]')) dialog.close();
  });
  return dialog;
}

/** Lê os campos de um formulário como objeto. */
function dadosFormulario(form) {
  return Object.fromEntries(new FormData(form).entries());
}

/** Preenche um <select> com os produtos ativos (com o saldo atual). */
async function preencherSelectProdutos(select, { valorAtual = '', mostrarSaldo = true } = {}) {
  const { produtos } = await api('/api/produtos');
  select.innerHTML = '<option value="">Selecione o produto…</option>' + produtos.map((p) =>
    `<option value="${p.id}">${esc((p.codigo ? p.codigo + ' – ' : '') + p.nome)}${mostrarSaldo ? ` (saldo: ${p.quantidade} ${esc(p.unidade)})` : ''}</option>`
  ).join('');
  select.value = valorAtual;
  return produtos;
}

function rotuloTipo(tipo) {
  const nomes = { entrada: 'Entrada', saida: 'Saída', devolucao: 'Devolução', ajuste: 'Ajuste' };
  return `<span class="tipo tipo-${esc(tipo)}">${nomes[tipo] || esc(tipo)}</span>`;
}

/** Mostra a variação do saldo com sinal: +10 ou −3 */
function variacao(m) {
  const d = m.saldo_posterior - m.saldo_anterior;
  return `<b class="${d < 0 ? 'diferenca-neg' : 'diferenca-pos'}">${d < 0 ? '−' : '+'}${Math.abs(d)}</b>`;
}

function seloOrcamento(situacao) {
  const mapa = {
    emitido: ['selo-ok', 'Válido'],
    expirado: ['selo-baixo', 'Expirado'],
    convertido: ['selo-info', 'Venda realizada'],
    cancelado: ['selo-neutro', 'Cancelado'],
    renovado: ['selo-neutro', 'Renovado'],
  };
  const [classe, texto] = mapa[situacao] || ['selo-neutro', situacao];
  return `<span class="selo ${classe}">${esc(texto)}</span>`;
}

function seloDevolucao(status) {
  const mapa = {
    pendente: ['selo-baixo', 'Aguardando conferência'],
    aprovada: ['selo-ok', 'Aprovada – voltou ao estoque'],
    reprovada: ['selo-esgotado', 'Reprovada – não voltou'],
  };
  const [classe, texto] = mapa[status] || ['selo-neutro', status];
  return `<span class="selo ${classe}">${texto}</span>`;
}

function celulaProduto(p, extra = '') {
  return `<div class="produto-celula">
    ${p.imagem ? `<img src="${esc(p.imagem)}" alt="">` : ''}
    <div><strong>${esc(p.nome || p.produto)}</strong><small>${p.codigo ? 'Cód. ' + esc(p.codigo) : ''}${extra}</small></div>
  </div>`;
}
