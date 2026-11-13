// Cadastro de funcionários e perfis de acesso (somente gerente)
const janela = ligarJanela(document.getElementById('janela'));
const form = document.getElementById('form-usuario');
let usuarios = [];
let editando = null;

async function carregar() {
  ({ usuarios } = await api('/api/usuarios'));
  document.getElementById('lista').innerHTML = usuarios.map((u) => `
    <tr>
      <td><strong>${esc(u.nome)}</strong></td>
      <td>${esc(u.login)}</td>
      <td>${u.perfil === 'gerente' ? '<span class="selo selo-info">Gerente</span>' : '<span class="selo selo-neutro">Atendente</span>'}</td>
      <td>${u.ativo ? '<span class="selo selo-ok">Ativo</span>' : '<span class="selo selo-esgotado">Desativado</span>'}</td>
      <td class="acoes-tabela"><button class="btn btn-pequeno" type="button" data-editar="${u.id}">Editar</button></td>
    </tr>`).join('');
}

function abrir(usuario) {
  editando = usuario;
  form.reset();
  document.getElementById('u-erro').classList.add('oculto');
  document.getElementById('u-titulo').textContent = usuario ? 'Editar funcionário' : 'Novo funcionário';
  form.login.disabled = Boolean(usuario);
  document.getElementById('campo-ativo').classList.toggle('oculto', !usuario);
  document.getElementById('u-senha-rotulo').textContent = usuario ? 'Nova senha (opcional)' : 'Senha *';
  document.getElementById('u-senha-ajuda').textContent = usuario
    ? 'Preencha só se quiser trocar a senha. Mínimo de 6 caracteres.' : 'Mínimo de 6 caracteres.';
  if (usuario) {
    form.nome.value = usuario.nome;
    form.login.value = usuario.login;
    form.perfil.value = usuario.perfil;
    form.ativo.value = usuario.ativo ? '1' : '0';
  }
  janela.showModal();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = dadosFormulario(form);
  try {
    if (editando) {
      await api('/api/usuarios/' + editando.id, {
        metodo: 'PUT',
        dados: { nome: d.nome, perfil: d.perfil, ativo: d.ativo === '1', nova_senha: d.senha || undefined },
      });
    } else {
      await api('/api/usuarios', { metodo: 'POST', dados: d });
    }
    toast('Funcionário salvo.', 'sucesso');
    janela.close();
    carregar();
  } catch (erro) {
    mostrarErro(document.getElementById('u-erro'), erro);
  }
});

document.getElementById('lista').addEventListener('click', (e) => {
  const b = e.target.closest('[data-editar]');
  if (b) abrir(usuarios.find((u) => u.id === Number(b.dataset.editar)));
});
document.getElementById('btn-novo').addEventListener('click', () => abrir(null));

iniciarPainel({ somenteGerente: true }).then(carregar).catch(() => {});
