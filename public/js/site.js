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
  ferragem: '<rect x="4" y="3" width="7" height="18" rx="1.5"/><rect x="13" y="3" width="7" height="18" rx="1.5"/><path d="M11 7.5h2M11 12h2M11 16.5h2"/>',
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

function mensagemDaLista(lista, cliente) {
  let texto = 'Olá! Gostaria de um orçamento destes produtos:\n' +
    lista.map((i) => `- ${i.quantidade} ${i.unidade} de ${i.codigo ? i.codigo + ' - ' : ''}${i.nome}`).join('\n');
  if (cliente) {
    texto += `\n\nNome: ${cliente.nome}\nCPF: ${cliente.cpf}`;
    if (cliente.pedido) texto += `\nPedido nº ${cliente.pedido} (feito pelo site)`;
  }
  return texto;
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

// ---------------------------------------------------------------------
// Antes de abrir o WhatsApp, o cliente informa nome e CPF.
// O pedido fica registrado nos orçamentos do painel da loja.
// ---------------------------------------------------------------------
const CHAVE_NOME = 'dois-irmaos-nome';

function formatarCpf(valor) {
  const d = String(valor).replace(/\D/g, '').slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** Confere os dígitos verificadores do CPF. */
function cpfValido(valor) {
  const cpf = String(valor).replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(cpf[tamanho])) return false;
  }
  return true;
}

let janelaDados = null;

function criarJanelaDados() {
  const dialog = document.createElement('dialog');
  dialog.id = 'janela-dados';
  dialog.setAttribute('aria-labelledby', 'dados-titulo');
  dialog.innerHTML = `
    <form novalidate>
      <div class="dialog-topo">
        <h2 id="dados-titulo">Seus dados para o orçamento</h2>
        <button class="fechar" type="button" data-fechar aria-label="Fechar">&times;</button>
      </div>
      <div class="dialog-corpo">
        <p class="ajuda">Assim a loja sabe para quem é o orçamento. Seu nome e CPF vão na mensagem do WhatsApp e ficam registrados só para o atendimento da loja.</p>
        <div class="oculto" data-erro role="alert"></div>
        <div class="campo">
          <label for="dados-nome">Nome completo *</label>
          <input id="dados-nome" name="nome" required minlength="3" maxlength="120" autocomplete="name">
        </div>
        <div class="campo">
          <label for="dados-cpf">CPF *</label>
          <input id="dados-cpf" name="cpf" required inputmode="numeric" maxlength="14" placeholder="000.000.000-00" autocomplete="off">
        </div>
        <div class="aviso aviso-sucesso oculto" data-sucesso role="status"></div>
      </div>
      <div class="dialog-rodape">
        <button class="btn" type="button" data-fechar>Cancelar</button>
        <button class="btn btn-primario" type="submit">Enviar pelo WhatsApp</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-fechar]')) dialog.close();
  });
  const cpf = dialog.querySelector('[name="cpf"]');
  cpf.addEventListener('input', () => { cpf.value = formatarCpf(cpf.value); });
  return dialog;
}

/**
 * Abre a janela de nome e CPF; ao confirmar, registra o pedido e abre o WhatsApp.
 *   itens:     [{ produto_id, quantidade }]
 *   mensagem:  função que recebe { nome, cpf, pedido } e devolve o texto do WhatsApp
 *   aoEnviar:  chamada depois que o pedido foi registrado (opcional)
 */
function pedirDadosEEnviar({ itens, mensagem, aoEnviar }) {
  janelaDados = janelaDados || criarJanelaDados();
  const form = janelaDados.querySelector('form');
  const caixaErro = form.querySelector('[data-erro]');
  const caixaSucesso = form.querySelector('[data-sucesso]');
  const botao = form.querySelector('[type="submit"]');

  form.reset();
  try { form.elements.nome.value = localStorage.getItem(CHAVE_NOME) || ''; } catch { /* sem armazenamento */ }
  caixaErro.classList.add('oculto');
  caixaSucesso.classList.add('oculto');
  form.querySelectorAll('.campo, .dialog-rodape [type="submit"]').forEach((el) => el.classList.remove('oculto'));
  form.querySelector('.dialog-rodape [data-fechar]').textContent = 'Cancelar';

  form.onsubmit = async (e) => {
    e.preventDefault();
    caixaErro.classList.add('oculto');
    const nome = form.elements.nome.value.trim().replace(/\s+/g, ' ');
    const cpf = form.elements.cpf.value;
    let problema = '';
    if (nome.length < 3) problema = 'Informe seu nome completo.';
    else if (!cpfValido(cpf)) problema = 'CPF inválido. Confira os números digitados.';
    if (problema) {
      mostrarErro(caixaErro, new Error(problema));
      (nome.length < 3 ? form.elements.nome : form.elements.cpf).focus();
      return;
    }

    botao.disabled = true;
    try {
      const pedido = await api('/api/pedidos-site', { metodo: 'POST', dados: { nome, cpf, itens } });
      try { localStorage.setItem(CHAVE_NOME, nome); } catch { /* sem armazenamento */ }
      const link = linkWhatsApp(mensagem({ nome, cpf: formatarCpf(cpf), pedido: pedido.id }));
      window.open(link, '_blank', 'noopener');

      // Se o navegador bloquear a nova aba, o cliente ainda tem o botão
      form.querySelectorAll('.campo, .dialog-rodape [type="submit"]').forEach((el) => el.classList.add('oculto'));
      caixaSucesso.innerHTML = `<strong>Pedido nº ${pedido.id} registrado!</strong><br>
        Agora é só enviar a mensagem no WhatsApp. Se ele não abriu, toque no botão abaixo.<br>
        <a class="btn btn-primario" href="${esc(link)}" target="_blank" rel="noopener">Abrir WhatsApp</a>`;
      caixaSucesso.classList.remove('oculto');
      form.querySelector('.dialog-rodape [data-fechar]').textContent = 'Fechar';
      if (aoEnviar) aoEnviar(pedido);
    } catch (erro) {
      mostrarErro(caixaErro, erro);
    } finally {
      botao.disabled = false;
    }
  };

  janelaDados.showModal();
  (form.elements.nome.value ? form.elements.cpf : form.elements.nome).focus();
}
