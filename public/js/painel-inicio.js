// Tela inicial do painel: indicadores, alertas de reposição e últimas movimentações

/** Gráfico de barras (SVG) com as unidades que entraram e saíram por dia. */
function desenharGrafico(porDia) {
  const L = 720, A = 220, esq = 40, base = 190, topo = 16;
  const maximo = Math.max(1, ...porDia.flatMap((d) => [d.entradas, d.saidas]));
  const passo = Math.pow(10, Math.floor(Math.log10(maximo)));
  const teto = Math.ceil(maximo / passo) * passo;
  const y = (v) => base - (v / teto) * (base - topo);
  const largura = (L - esq - 8) / porDia.length;
  const barra = Math.min(16, largura / 2 - 3);
  const linhas = [0, teto / 2, teto].map((v) => `
    <line x1="${esq}" x2="${L - 4}" y1="${y(v)}" y2="${y(v)}" class="g-grade"/>
    <text x="${esq - 8}" y="${y(v) + 4}" text-anchor="end" class="g-eixo">${Math.round(v)}</text>`).join('');
  const barras = porDia.map((d, i) => {
    const cx = esq + largura * i + largura / 2;
    const [ano, mes, dia] = d.dia.split('-');
    return `<g><title>${dia}/${mes}: ${d.entradas} entraram, ${d.saidas} saíram</title>
      <rect x="${cx - barra - 1}" y="${y(d.entradas)}" width="${barra}" height="${base - y(d.entradas)}" rx="2" class="g-entrada"/>
      <rect x="${cx + 1}" y="${y(d.saidas)}" width="${barra}" height="${base - y(d.saidas)}" rx="2" class="g-saida"/>
      ${i % 2 === porDia.length % 2 ? '' : `<text x="${cx}" y="${base + 18}" text-anchor="middle" class="g-eixo">${dia}/${mes}</text>`}</g>`;
  }).join('');
  document.getElementById('grafico').innerHTML =
    `<svg viewBox="0 0 ${L} ${A}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${linhas}${barras}</svg>`;
}

async function carregarResumo() {
  const { totais, alertas, ultimas, por_dia: porDia } = await api('/api/resumo');
  desenharGrafico(porDia);

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
