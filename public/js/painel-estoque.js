// Produtos e estoque: consulta em tempo real, detalhes, cadastro e edição
const lista = document.getElementById('lista');
const filtros = document.getElementById('filtros');
const janelaDetalhes = ligarJanela(document.getElementById('janela-detalhes'));
const janelaForm = ligarJanela(document.getElementById('janela-form'));
const formProduto = document.getElementById('form-produto');

let produtos = [];
let categorias = [];
let editando = null;          // produto em edição (null = novo)
let imagemEscolhida = null;   // caminho de ilustração
let fotoEnviada = null;       // data URL da foto enviada

async function carregarCategorias() {
  ({ categorias } = await api('/api/categorias'));
  const opcoes = categorias.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  document.getElementById('f-categoria').innerHTML = '<option value="">Todas</option>' + opcoes;
  document.getElementById('p-categoria').innerHTML = '<option value="">Sem categoria</option>' + opcoes;
}

async function carregarProdutos(mudou) {
  const params = new URLSearchParams();
  for (const [k, v] of new FormData(filtros)) if (v) params.set(k, v);
  const anteriores = new Map(produtos.map((p) => [p.id, p.quantidade]));
  ({ produtos } = await api('/api/produtos?' + params));

  lista.innerHTML = produtos.length ? produtos.map((p) => {
    const classeQtd = p.quantidade === 0 ? 'zero' : p.quantidade <= p.estoque_minimo ? 'baixa' : '';
    const alterou = mudou && anteriores.has(p.id) && anteriores.get(p.id) !== p.quantidade;
    return `
      <tr class="${alterou ? 'destacar' : ''}">
        <td>${celulaProduto(p, p.ativo ? '' : ' · <b>desativado</b>')}</td>
        <td>${esc(p.categoria || '—')}</td>
        <td class="num">${reais(p.preco_centavos)}<br><small class="ajuda">/ ${esc(p.unidade)}</small></td>
        <td class="num"><span class="qtd ${classeQtd}">${p.quantidade}</span> ${esc(p.unidade)}</td>
        <td class="num">${p.estoque_minimo}</td>
        <td>${seloEstoque(p)}</td>
        <td class="acoes-tabela">
          <button class="btn btn-pequeno" type="button" data-detalhes="${p.id}">Detalhes</button>
          ${ehGerente() ? `<button class="btn btn-pequeno" type="button" data-editar="${p.id}">Editar</button>` : ''}
        </td>
      </tr>`;
  }).join('') : '<tr><td colspan="7" class="vazio">Nenhum produto encontrado.</td></tr>';
}

// ---------------------------------------------------------------------
// Detalhes
// ---------------------------------------------------------------------
async function abrirDetalhes(id) {
  const { produto: p, movimentacoes, precos } = await api('/api/produtos/' + id);
  document.getElementById('det-titulo').textContent = p.nome;
  document.getElementById('det-corpo').innerHTML = `
    <div class="detalhe-produto">
      <img src="${esc(p.imagem)}" alt="${esc(p.nome)}">
      <div>
        <p class="categoria">${esc(p.categoria || 'Sem categoria')}${p.codigo ? ' · Código ' + esc(p.codigo) : ''}</p>
        <p class="preco">${reais(p.preco_centavos)} <small>por ${esc(p.unidade)}</small></p>
        <div class="info-produto">
          Disponível agora: <strong>${p.quantidade} ${esc(p.unidade)}</strong> ${seloEstoque(p)}<br>
          Estoque mínimo: ${p.estoque_minimo} ${esc(p.unidade)}
        </div>
        <p>${esc(p.descricao || '')}</p>
        <div class="acoes">
          <a class="btn btn-pequeno" href="/painel/movimentacoes.html?produto=${p.id}">Registrar entrada/saída</a>
          <a class="btn btn-pequeno" href="/painel/movimentacoes.html?historico=${p.id}">Histórico completo</a>
        </div>
      </div>
    </div>
    <h3 class="titulo-espec">Especificações técnicas</h3>
    ${tabelaEspecificacoes(p.especificacoes)}
    <h3 class="titulo-espec">Últimas movimentações</h3>
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead><tr><th>Data</th><th>Tipo</th><th class="num">Variação</th><th class="num">Saldo</th><th>Funcionário</th><th>Observação</th></tr></thead>
        <tbody>${movimentacoes.map((m) => `
          <tr><td>${dataHora(m.data)}</td><td>${rotuloTipo(m.tipo)}</td><td class="num">${variacao(m)}</td>
          <td class="num">${m.saldo_anterior} → <b>${m.saldo_posterior}</b></td><td>${esc(m.funcionario)}</td>
          <td>${esc(m.observacao || '')}</td></tr>`).join('') || '<tr><td colspan="6">Sem movimentações.</td></tr>'}
        </tbody>
      </table>
    </div>
    ${precos.length ? `
      <h3 class="titulo-espec">Alterações de preço</h3>
      <ul class="lista-simples">${precos.map((h) => `
        <li><div>${reais(h.preco_anterior)} → <b>${reais(h.preco_novo)}</b><small>${esc(h.funcionario)}</small></div>
        <div>${dataHora(h.data)}</div></li>`).join('')}</ul>` : ''}`;
  janelaDetalhes.showModal();
}

// ---------------------------------------------------------------------
// Cadastro / edição (gerente)
// ---------------------------------------------------------------------
let ilustracoes = [];

function desenharGaleria() {
  document.getElementById('galeria').innerHTML = ilustracoes.map((src) => `
    <button type="button" data-ilustracao="${esc(src)}" aria-pressed="${src === imagemEscolhida && !fotoEnviada}"
      title="${esc(src.split('/').pop().replace('.svg', ''))}"><img src="${esc(src)}" alt=""></button>`).join('');
}

function definirPrevia(src) {
  document.getElementById('previa').src = src;
}

async function abrirFormulario(id) {
  if (!ilustracoes.length) ({ ilustracoes } = await api('/api/ilustracoes'));
  editando = id ? produtos.find((p) => p.id === id) || (await api('/api/produtos/' + id)).produto : null;
  formProduto.reset();
  fotoEnviada = null;
  document.getElementById('form-erro').classList.add('oculto');
  document.getElementById('form-titulo').textContent = editando ? 'Editar produto' : 'Cadastrar produto';
  document.getElementById('campo-qtd-inicial').classList.toggle('oculto', Boolean(editando));
  document.getElementById('aviso-qtd').classList.toggle('oculto', !editando);
  const btnAtivo = document.getElementById('btn-ativo');
  btnAtivo.classList.toggle('oculto', !editando);

  if (editando) {
    const f = formProduto.elements;
    f.nome.value = editando.nome;
    f.codigo.value = editando.codigo || '';
    f.categoria_id.value = editando.categoria_id || '';
    f.unidade.value = editando.unidade;
    f.preco.value = (editando.preco_centavos / 100).toFixed(2).replace('.', ',');
    f.estoque_minimo.value = editando.estoque_minimo;
    f.descricao.value = editando.descricao || '';
    f.especificacoes.value = editando.especificacoes || '';
    imagemEscolhida = editando.imagem;
    btnAtivo.textContent = editando.ativo ? 'Desativar produto' : 'Reativar produto';
  } else {
    imagemEscolhida = ilustracoes[0] || null;
  }
  definirPrevia(imagemEscolhida || '');
  desenharGaleria();
  janelaForm.showModal();
}

document.getElementById('galeria').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ilustracao]');
  if (!b) return;
  imagemEscolhida = b.dataset.ilustracao;
  fotoEnviada = null;
  document.getElementById('p-foto').value = '';
  definirPrevia(imagemEscolhida);
  desenharGaleria();
});

document.getElementById('p-foto').addEventListener('change', (e) => {
  const arquivo = e.target.files[0];
  if (!arquivo) return;
  if (arquivo.size > 2 * 1024 * 1024) {
    toast('A foto deve ter no máximo 2 MB.', 'erro');
    e.target.value = '';
    return;
  }
  const leitor = new FileReader();
  leitor.onload = () => {
    fotoEnviada = leitor.result;
    definirPrevia(fotoEnviada);
    desenharGaleria();
  };
  leitor.readAsDataURL(arquivo);
});

formProduto.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dados = dadosFormulario(formProduto);
  if (fotoEnviada) dados.imagem_upload = fotoEnviada;
  else dados.imagem = imagemEscolhida;
  const botao = formProduto.querySelector('[type=submit]');
  botao.disabled = true;
  try {
    if (editando) {
      await api('/api/produtos/' + editando.id, { metodo: 'PUT', dados });
      toast('Produto atualizado.', 'sucesso');
    } else {
      await api('/api/produtos', { metodo: 'POST', dados });
      toast('Produto cadastrado.', 'sucesso');
    }
    janelaForm.close();
    carregarProdutos();
  } catch (erro) {
    mostrarErro(document.getElementById('form-erro'), erro);
    document.getElementById('form-erro').scrollIntoView({ block: 'nearest' });
  } finally {
    botao.disabled = false;
  }
});

document.getElementById('btn-ativo').addEventListener('click', async () => {
  if (!editando) return;
  const ativar = !editando.ativo;
  if (!ativar && !confirm(`Desativar "${editando.nome}"? Ele some do catálogo e não poderá ser orçado, mas o histórico é mantido.`)) return;
  try {
    await api(`/api/produtos/${editando.id}/ativo`, { metodo: 'POST', dados: { ativo: ativar } });
    toast(ativar ? 'Produto reativado.' : 'Produto desativado.', 'sucesso');
    janelaForm.close();
    carregarProdutos();
  } catch (erro) {
    toast(erro.message, 'erro');
  }
});

// ---------------------------------------------------------------------
// Eventos gerais
// ---------------------------------------------------------------------
lista.addEventListener('click', (e) => {
  const det = e.target.closest('[data-detalhes]');
  const edt = e.target.closest('[data-editar]');
  if (det) abrirDetalhes(Number(det.dataset.detalhes)).catch((err) => toast(err.message, 'erro'));
  if (edt) abrirFormulario(Number(edt.dataset.editar)).catch((err) => toast(err.message, 'erro'));
});

let espera;
filtros.addEventListener('input', () => {
  clearTimeout(espera);
  espera = setTimeout(() => carregarProdutos(), 250);
});
filtros.addEventListener('submit', (e) => e.preventDefault());
document.getElementById('btn-novo').addEventListener('click', () => abrirFormulario(null));

iniciarPainel().then(async () => {
  const situacao = new URLSearchParams(location.search).get('situacao');
  if (situacao) document.getElementById('f-situacao').value = situacao;
  await carregarCategorias();
  await carregarProdutos();
  ouvirTempoReal(['estoque'], () => carregarProdutos(true));
}).catch(() => {});
