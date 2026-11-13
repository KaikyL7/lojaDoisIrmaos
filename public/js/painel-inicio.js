// Tela inicial do painel: indicadores, alertas de reposição e últimas movimentações

async function carregarResumo() {
  const { totais, alertas, ultimas } = await api('/api/resumo');

  document.getElementById('indicadores').innerHTML = `
    <a class="indicador" href="/painel/estoque.html"><span>Produtos ativos</span><strong>${totais.produtos}</strong></a>
    <a class="indicador perigo" href="/painel/estoque.html?situacao=esgotado"><span>Esgotados</span><strong>${totais.esgotados || 0}</strong></a>
    <a class="indicador alerta" href="/painel/estoque.html?situacao=baixo"><span>Estoque baixo</span><strong>${totais.estoque_baixo || 0}</strong></a>
    <a class="indicador" href="/painel/devolucoes.html"><span>Devoluções pendentes</span><strong>${totais.devolucoes_pendentes}</strong></a>
    <a class="indicador ouro" href="/painel/orcamentos.html?situacao=emitido"><span>Orçamentos válidos</span><strong>${totais.orcamentos_validos}</strong></a>
    <div class="indicador ouro" data-gerente><span>Valor em estoque</span><strong>${reais(totais.valor_estoque_centavos)}</strong></div>`;
  aplicarPermissoes(document.getElementById('indicadores'));

  document.getElementById('alertas').innerHTML = alertas.length
    ? alertas.map((p) => `
      <li>
        <div><strong>${esc(p.nome)}</strong><small>${p.codigo ? 'Cód. ' + esc(p.codigo) + ' · ' : ''}mínimo: ${p.estoque_minimo} ${esc(p.unidade)}</small></div>
        <div>${p.quantidade === 0 ? '<span class="selo selo-esgotado">Esgotado</span>'
          : `<span class="selo selo-baixo">${p.quantidade} ${esc(p.unidade)}</span>`}</div>
      </li>`).join('')
    : '<li>Nenhum produto precisa de reposição agora.</li>';

  document.getElementById('ultimas').innerHTML = ultimas.length
    ? ultimas.map((m) => `
      <li>
        <div><strong>${esc(m.produto)}</strong><small>${dataHora(m.data)} · ${esc(m.funcionario)}</small></div>
        <div>${rotuloTipo(m.tipo)} ${variacao(m)}</div>
      </li>`).join('')
    : '<li>Nenhuma movimentação registrada.</li>';
}

iniciarPainel().then((usuario) => {
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('saudacao').textContent = `${saudacao}, ${usuario.nome.split(' ')[0]}!`;
  carregarResumo();
  ouvirTempoReal(['estoque', 'devolucao'], carregarResumo);
}).catch(() => {});
