// Devoluções: registro (todos) e confirmação da condição da mercadoria (gerente)
const formDev = document.getElementById('form-dev');
const janela = ligarJanela(document.getElementById('janela-avaliar'));
let statusFiltro = 'pendente';
let devolucoes = [];
let avaliando = null;

async function carregar() {
  ({ devolucoes } = await api('/api/devolucoes' + (statusFiltro ? '?status=' + statusFiltro : '')));
  document.getElementById('lista').innerHTML = devolucoes.length ? devolucoes.map((d) => `
    <tr>
      <td>${dataHora(d.data)}<br><small class="ajuda">por ${esc(d.registrado_por)}</small></td>
      <td><strong>${esc(d.produto)}</strong><br><small class="ajuda">${esc(d.codigo || '')}</small></td>
      <td class="num">${d.quantidade} ${esc(d.unidade)}</td>
      <td>${esc(d.motivo)}${d.parecer ? `<br><small class="ajuda">Parecer: ${esc(d.parecer)}</small>` : ''}</td>
      <td>${seloDevolucao(d.status)}${d.avaliado_por ? `<br><small class="ajuda">${esc(d.avaliado_por)} · ${dataHora(d.data_avaliacao)}</small>` : ''}</td>
      <td class="acoes-tabela">${d.status === 'pendente' && ehGerente()
        ? `<button class="btn btn-pequeno btn-escuro" type="button" data-avaliar="${d.id}">Conferir</button>` : ''}</td>
    </tr>`).join('') : `<tr><td colspan="6" class="vazio">${statusFiltro ? 'Nenhuma devolução aguardando conferência.' : 'Nenhuma devolução registrada.'}</td></tr>`;
}

formDev.addEventListener('submit', async (e) => {
  e.preventDefault();
  const caixa = document.getElementById('dev-erro');
  caixa.classList.add('oculto');
  try {
    await api('/api/devolucoes', { metodo: 'POST', dados: dadosFormulario(formDev) });
    toast('Devolução registrada. Aguardando conferência do gerente.', 'sucesso');
    formDev.reset();
    carregar();
  } catch (erro) {
    mostrarErro(caixa, erro);
  }
});

document.querySelector('.abas').addEventListener('click', (e) => {
  const aba = e.target.closest('[data-status]');
  if (!aba) return;
  statusFiltro = aba.dataset.status;
  document.querySelectorAll('.aba').forEach((a) => a.setAttribute('aria-selected', String(a === aba)));
  carregar();
});

document.getElementById('lista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-avaliar]');
  if (!b) return;
  avaliando = devolucoes.find((d) => d.id === Number(b.dataset.avaliar));
  document.getElementById('av-info').innerHTML = `
    <strong>${esc(avaliando.produto)}</strong> — ${avaliando.quantidade} ${esc(avaliando.unidade)}<br>
    Motivo informado: ${esc(avaliando.motivo)}`;
  document.getElementById('form-avaliar').reset();
  document.getElementById('av-erro').classList.add('oculto');
  janela.showModal();
});

async function avaliar(aprovar) {
  try {
    await api(`/api/devolucoes/${avaliando.id}/avaliar`, {
      metodo: 'POST',
      dados: { aprovar, parecer: document.getElementById('av-parecer').value },
    });
    toast(aprovar ? 'Devolução aprovada: quantidade devolvida ao estoque.' : 'Devolução reprovada.', 'sucesso');
    janela.close();
    carregar();
  } catch (erro) {
    mostrarErro(document.getElementById('av-erro'), erro);
  }
}
document.getElementById('btn-aprovar').addEventListener('click', () => avaliar(true));
document.getElementById('btn-reprovar').addEventListener('click', () => avaliar(false));

iniciarPainel().then(async () => {
  await preencherSelectProdutos(document.getElementById('d-produto'), { mostrarSaldo: false });
  await carregar();
  ouvirTempoReal(['devolucao'], carregar);
}).catch(() => {});
