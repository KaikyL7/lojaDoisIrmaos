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

/** "2026-11-12 21:37:11" → "12/11/2026 21:37" */
function dataHora(texto) {
  if (!texto) return '';
  const [d, h = ''] = String(texto).split(' ');
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a}${h ? ' ' + h.slice(0, 5) : ''}`;
}
function data(texto) {
  return dataHora(String(texto || '').split(' ')[0]);
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
function ouvirTempoReal(eventos, aoMudar) {
  if (!window.EventSource) return;
  const fonte = new EventSource('/api/eventos');
  let espera;
  for (const evento of eventos) {
    fonte.addEventListener(evento, (e) => {
      clearTimeout(espera);
      espera = setTimeout(() => aoMudar(evento, JSON.parse(e.data || '{}')), 150);
    });
  }
  return fonte;
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
