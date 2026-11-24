// =====================================================================
//  Funções compartilhadas por todas as páginas
// =====================================================================

// Dados da loja (altere aqui e o site inteiro é atualizado)
const LOJA = {
  nome: 'Loja Dois Irmãos – Casa & Obra',
  endereco: 'Avenida Padre José Marciano, 302 – Centro',
  cidade: 'Alvinópolis – MG',
  telefone: '(31) 97114-9666',
  whatsapp: '5531971149666',
  horarios: ['Segunda a sexta: 07:00 às 18:00', 'Sábado: 07:00 às 12:00', 'Domingo: fechado'],
};

/** Escapa texto antes de colocar em HTML (evita XSS). */
function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const formatoReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function reais(centavos) {
  return formatoReal.format((Number(centavos) || 0) / 100);
}

// Datas sempre no horário de Brasília, qualquer que seja o fuso do computador
const formatoDataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** Data e hora vindas do banco ("2026-11-12T21:37:11.000Z") → "12/11/2026 18:37" */
function dataHora(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? String(valor) : formatoDataHora.format(d).replace(',', '');
}

/** Data sem hora ("2026-11-19") → "19/11/2026" */
function data(valor) {
  const [a, m, dia] = String(valor || '').slice(0, 10).split('-');
  return a && m && dia ? `${dia}/${m}/${a}` : '';
}

/** Chamada à API do servidor. Lança erro com a mensagem vinda do back-end. */
async function api(caminho, { metodo = 'GET', dados } = {}) {
  const opcoes = { method: metodo, headers: {} };
  if (dados !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(dados);
  }
  const resp = await fetch(caminho, opcoes);
  const json = await resp.json().catch(() => ({}));
  if (resp.status === 401 && location.pathname.startsWith('/painel/')) {
    location.href = '/login.html?voltar=' + encodeURIComponent(location.pathname + location.search);
    throw new Error('Sessão encerrada.');
  }
  if (!resp.ok) {
    const erro = new Error(json.erro || 'Não foi possível concluir a operação.');
    erro.detalhes = json.detalhes;
    erro.status = resp.status;
    throw erro;
  }
  return json;
}

/** Mensagem rápida no canto da tela. */
function toast(mensagem, tipo = '') {
  let area = document.getElementById('toasts');
  if (!area) {
    area = document.createElement('div');
    area.id = 'toasts';
    area.setAttribute('role', 'status');
    document.body.appendChild(area);
  }
  const t = document.createElement('div');
  t.className = 'toast' + (tipo ? ' toast-' + tipo : '');
  t.textContent = mensagem;
  area.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

/** Mostra um erro dentro de um elemento (com a lista de detalhes, se houver). */
function mostrarErro(elemento, erro) {
  let html = `<strong>${esc(erro.message)}</strong>`;
  if (Array.isArray(erro.detalhes) && erro.detalhes.length) {
    html += '<ul>' + erro.detalhes.map((d) => `<li><b>${esc(d.produto)}</b>: ${esc(d.motivo)}</li>`).join('') + '</ul>';
  }
  elemento.innerHTML = html;
  elemento.className = 'aviso aviso-erro';
  elemento.classList.remove('oculto');
}

/** Selo de situação do estoque. */
function seloEstoque(p) {
  if (p.quantidade === 0) return '<span class="selo selo-esgotado">Esgotado</span>';
  if (p.quantidade <= p.estoque_minimo) return '<span class="selo selo-baixo">Estoque baixo</span>';
  return '<span class="selo selo-ok">Disponível</span>';
}

/** Converte o texto "Chave: valor" (uma por linha) em tabela. */
function tabelaEspecificacoes(texto) {
  const linhas = String(texto || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!linhas.length) return '<p class="ajuda">Sem especificações cadastradas.</p>';
  return '<table class="especificacoes"><tbody>' + linhas.map((l) => {
    const i = l.indexOf(':');
    return i > 0
      ? `<tr><th>${esc(l.slice(0, i))}</th><td>${esc(l.slice(i + 1).trim())}</td></tr>`
      : `<tr><td colspan="2">${esc(l)}</td></tr>`;
  }).join('') + '</tbody></table>';
}

/**
 * Tempo real: escuta os avisos do servidor (Server-Sent Events)
 * e chama "aoMudar" sempre que o estoque for alterado.
 */
//
// Cada aba usa UMA única conexão (o navegador só permite 6 conexões abertas por site;
// com uma conexão por ouvinte, poucas abas abertas já travavam o site inteiro).
// Abas em segundo plano fecham a conexão e, ao voltar, reconectam e recarregam os dados.
const tempoReal = { fonte: null, ouvintes: [] };

function ligarOuvinte(fonte, ouvinte) {
  for (const evento of ouvinte.eventos) {
    fonte.addEventListener(evento, (e) => {
      clearTimeout(ouvinte.espera);
      ouvinte.espera = setTimeout(() => ouvinte.aoMudar(evento, JSON.parse(e.data || '{}')), 150);
    });
  }
}

function conectarTempoReal() {
  if (tempoReal.fonte || document.hidden) return;
  tempoReal.fonte = new EventSource('/api/eventos');
  tempoReal.ouvintes.forEach((o) => ligarOuvinte(tempoReal.fonte, o));
}

function desconectarTempoReal() {
  if (!tempoReal.fonte) return;
  tempoReal.fonte.close();
  tempoReal.fonte = null;
}

if (window.EventSource) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return desconectarTempoReal();
    conectarTempoReal();
    // Enquanto a aba estava escondida, algo pode ter mudado: recarrega os dados
    tempoReal.ouvintes.forEach((o) => o.aoMudar(o.eventos[0], {}));
  });
  window.addEventListener('pagehide', desconectarTempoReal);
}

function ouvirTempoReal(eventos, aoMudar) {
  if (!window.EventSource) return;
  const ouvinte = { eventos, aoMudar, espera: null };
  tempoReal.ouvintes.push(ouvinte);
  if (tempoReal.fonte) ligarOuvinte(tempoReal.fonte, ouvinte);
  else conectarTempoReal();
}

/** Preenche elementos marcados com data-loja="campo" com os dados da loja. */
function preencherDadosLoja() {
  document.querySelectorAll('[data-loja]').forEach((el) => {
    const campo = el.dataset.loja;
    if (campo === 'horarios') {
      el.innerHTML = LOJA.horarios.map((h) => `<p>${esc(h)}</p>`).join('');
    } else if (campo === 'whatsapp-link') {
      el.href = `https://wa.me/${LOJA.whatsapp}`;
    } else if (campo === 'ano') {
      el.textContent = new Date().getFullYear();
    } else if (LOJA[campo]) {
      el.textContent = LOJA[campo];
    }
  });
}

document.addEventListener('DOMContentLoaded', preencherDadosLoja);

/** Botão de olho nos campos de senha: mostra/esconde o que está sendo digitado. */
const OLHO_ABERTO = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
const OLHO_FECHADO = '<path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.4 3.3M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>';

function svgOlho(caminhos) {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminhos}</svg>`;
}

function ligarOlhoSenha(campo) {
  const caixa = document.createElement('div');
  caixa.className = 'campo-senha';
  campo.parentNode.insertBefore(caixa, campo);
  caixa.appendChild(campo);

  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'btn-olho';
  caixa.appendChild(botao);

  const mostrar = (visivel) => {
    campo.type = visivel ? 'text' : 'password';
    botao.innerHTML = svgOlho(visivel ? OLHO_FECHADO : OLHO_ABERTO);
    botao.setAttribute('aria-label', visivel ? 'Ocultar senha' : 'Mostrar senha');
    botao.setAttribute('aria-pressed', String(visivel));
  };
  mostrar(false);

  botao.addEventListener('click', () => {
    mostrar(campo.type === 'password');
    campo.focus();
  });
  // Ao limpar/reabrir o formulário, a senha volta a ficar escondida
  if (campo.form) campo.form.addEventListener('reset', () => mostrar(false));
  if (campo.form) campo.form.addEventListener('submit', () => mostrar(false));
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input[type="password"]').forEach(ligarOlhoSenha);
});
