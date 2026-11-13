// Cadastro de funcionários (somente gerente)
const { db } = require('../db');
const { rota, enviarJson, ErroHttp, texto } = require('../http');
const { exigirGerente } = require('../autenticacao');
const { gerarHashSenha } = require('../seguranca');

const PERFIS = ['atendente', 'gerente'];

function validarPerfil(perfil) {
  if (!PERFIS.includes(perfil)) throw new ErroHttp(400, 'Perfil inválido.');
  return perfil;
}

function validarSenha(senha) {
  const s = String(senha || '');
  if (s.length < 6) throw new ErroHttp(400, 'A senha deve ter pelo menos 6 caracteres.');
  return s;
}

function gerentesAtivos(excetoId) {
  return db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE perfil = 'gerente' AND ativo = 1 AND id <> ?")
    .get(excetoId).n;
}

rota('GET', '/api/usuarios', exigirGerente, (req, res) => {
  const usuarios = db.prepare('SELECT id, nome, login, perfil, ativo, criado_em FROM usuarios ORDER BY nome').all();
  enviarJson(res, 200, { usuarios });
});

rota('POST', '/api/usuarios', exigirGerente, (req, res, ctx) => {
  const nome = texto(ctx.body.nome, 'nome', { obrigatorio: true, max: 100 });
  const login = texto(ctx.body.login, 'usuário', { obrigatorio: true, max: 50 }).toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(login)) {
    throw new ErroHttp(400, 'O usuário deve ter de 3 a 50 caracteres: letras, números, ponto, hífen ou sublinhado.');
  }
  const perfil = validarPerfil(ctx.body.perfil);
  const senha = validarSenha(ctx.body.senha);
  try {
    const r = db.prepare('INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?, ?, ?, ?)')
      .run(nome, login, gerarHashSenha(senha), perfil);
    enviarJson(res, 201, { id: Number(r.lastInsertRowid) });
  } catch {
    throw new ErroHttp(409, 'Já existe um funcionário com esse usuário.');
  }
});

rota('PUT', '/api/usuarios/:id', exigirGerente, (req, res, ctx) => {
  const id = Number(ctx.params.id);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) throw new ErroHttp(404, 'Funcionário não encontrado.');

  const nome = texto(ctx.body.nome, 'nome', { obrigatorio: true, max: 100 });
  const perfil = validarPerfil(ctx.body.perfil);
  const ativo = ctx.body.ativo ? 1 : 0;

  // Evita que a loja fique sem nenhum gerente ativo
  if ((perfil !== 'gerente' || !ativo) && u.perfil === 'gerente' && gerentesAtivos(id) === 0) {
    throw new ErroHttp(409, 'É preciso manter pelo menos um gerente ativo no sistema.');
  }
  if (id === ctx.usuario.id && !ativo) throw new ErroHttp(409, 'Você não pode desativar o próprio usuário.');

  db.prepare('UPDATE usuarios SET nome = ?, perfil = ?, ativo = ? WHERE id = ?').run(nome, perfil, ativo, id);
  if (ctx.body.nova_senha) {
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(gerarHashSenha(validarSenha(ctx.body.nova_senha)), id);
  }
  if ((!ativo || ctx.body.nova_senha) && id !== ctx.usuario.id) {
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(id); // encerra sessões abertas
  }
  enviarJson(res, 200, { ok: true });
});
