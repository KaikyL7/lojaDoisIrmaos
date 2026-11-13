// Login de funcionários
const form = document.getElementById('form-login');
const caixaErro = document.getElementById('erro');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = form.querySelector('button');
  botao.disabled = true;
  caixaErro.classList.add('oculto');
  try {
    await api('/api/auth/login', {
      metodo: 'POST',
      dados: { login: form.login.value, senha: form.senha.value },
    });
    const voltar = new URLSearchParams(location.search).get('voltar');
    // Só redireciona para páginas internas do painel
    location.href = voltar && voltar.startsWith('/painel/') ? voltar : '/painel/index.html';
  } catch (erro) {
    mostrarErro(caixaErro, erro);
    form.senha.value = '';
    form.senha.focus();
  } finally {
    botao.disabled = false;
  }
});

// Se já estiver logado, vai direto para o painel
api('/api/auth/eu').then(() => (location.href = '/painel/index.html')).catch(() => {});
