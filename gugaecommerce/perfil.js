document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.isLoggedIn()) {
        alert('Você precisa estar logado para acessar seu perfil.');
        window.location.href = 'login.html';
        return;
    }

    const usuario = Auth.getUser();

    // Preenche os campos
    document.getElementById('nome').value = usuario.nome || usuario.name || '';
    document.getElementById('email').value = usuario.email || '';
    document.getElementById('telefone').value = usuario.telefone || '';
    document.getElementById('cpf').value = usuario.cpf || '';

    const form = document.getElementById('form-editar-perfil');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const novaSenha = document.getElementById('nova-senha').value.trim();
        const confirmaSenha = document.getElementById('confirma-senha').value.trim();

        if (novaSenha && novaSenha !== confirmaSenha) {
            exibirMensagem('As senhas digitadas não coincidem!', 'erro');
            return;
        }

        const dadosAtualizados = {
            id: usuario.id,
            nome: document.getElementById('nome').value.trim(),
            email: document.getElementById('email').value.trim(),
            telefone: document.getElementById('telefone').value.trim(),
            cpf: document.getElementById('cpf').value.trim(),
            novaSenha: novaSenha || null
        };

        try {
            const resposta = await fetch('http://localhost:3000/api/usuario/perfil', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosAtualizados)
            });

            const resultado = await resposta.json();

            if (resposta.ok) {
                exibirMensagem('Perfil atualizado com sucesso!', 'sucesso');

                const usuarioAtualizado = {
                    ...usuario,
                    nome: dadosAtualizados.nome,
                    name: dadosAtualizados.nome,
                    email: dadosAtualizados.email,
                    telefone: dadosAtualizados.telefone,
                    cpf: dadosAtualizados.cpf
                };

                Auth.setUser(usuarioAtualizado);

                document.getElementById('nova-senha').value = '';
                document.getElementById('confirma-senha').value = '';

                setTimeout(() => { window.location.reload(); }, 1200);
            } else {
                exibirMensagem(resultado.mensagem || resultado.erro || 'Erro ao atualizar perfil.', 'erro');
            }

        } catch (error) {
            console.error('Erro na requisição:', error);
            exibirMensagem('Não foi possível conectar ao servidor.', 'erro');
        }
    });
});

function exibirMensagem(texto, tipo) {
    const msgDiv = document.getElementById('mensagem-feedback');
    msgDiv.innerText = texto;
    msgDiv.style.display = 'block';

    if (tipo === 'sucesso') {
        msgDiv.style.backgroundColor = 'rgba(25, 162, 229, 0.15)';
        msgDiv.style.color = 'var(--azul-escuro-guga)';
        msgDiv.style.border = '1px solid var(--azul-claro-guga)';
    } else {
        msgDiv.style.backgroundColor = 'rgba(230, 51, 42, 0.15)';
        msgDiv.style.color = 'var(--vermelho-guga)';
        msgDiv.style.border = '1px solid var(--vermelho-guga)';
    }
}