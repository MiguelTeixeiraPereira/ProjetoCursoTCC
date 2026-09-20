const API_URL = 'http://localhost:3000/api/auth';

const Auth = {
    // Validação estrita de login (evita falsos positivos com objetos vazios)
    isLoggedIn: () => {
        const isLogged = localStorage.getItem('guga_user_logged') === 'true';
        const user = Auth.getUser();
        return isLogged && !!user && Object.keys(user).length > 0;
    },
    
    // Redireciona para o login caso não esteja autenticado
    requireAuth: (actionCallback) => {
        if (!Auth.isLoggedIn()) {
            alert('Você precisa estar logado para acessar ou adicionar itens ao orçamento!');
            sessionStorage.setItem('redirect_after_login', window.location.href);
            window.location.href = 'login.html';
            return false;
        }
        if (typeof actionCallback === 'function') {
            actionCallback();
        }
        return true;
    },

    getUser: () => {
        const raw = localStorage.getItem('guga_user_data') || 
                    localStorage.getItem('usuario_logado') || 
                    localStorage.getItem('usuario') || 
                    localStorage.getItem('user');
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    },

    isAdmin: (usuario) => {
        const user = usuario || Auth.getUser();
        if (!user || !Object.keys(user).length) return false;

        const tipo = (
            user.tipo_usuario || 
            user.tipo || 
            user.role || 
            user.permissao || 
            user.nivel || 
            ''
        ).toString().toLowerCase().trim();

        return (
            tipo === 'admin' || 
            tipo === 'adm' || 
            tipo === 'administrador' || 
            user.is_admin === true || 
            user.isAdmin === true || 
            user.is_admin === 1 || 
            user.isAdmin === 1 || 
            tipo === '1'
        );
    },

    setUser: (usuario) => {
        if (!usuario) return;
        
        const eAdmin = Auth.isAdmin(usuario);
        const usuarioPadrao = {
            ...usuario,
            name: usuario.nome || usuario.name || 'Usuário',
            tipo_usuario: eAdmin ? 'admin' : (usuario.tipo_usuario || usuario.tipo || 'cliente'),
            tipo: eAdmin ? 'admin' : (usuario.tipo || 'cliente'),
            role: eAdmin ? 'admin' : (usuario.role || 'cliente')
        };

        const json = JSON.stringify(usuarioPadrao);

        localStorage.setItem('guga_user_logged', 'true');
        localStorage.setItem('guga_user_data', json);
        localStorage.setItem('usuario_logado', json);
        localStorage.setItem('usuario', json);
        localStorage.setItem('user', json);
    },

    login: async (email, senha) => {
        try {
            let response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha })
            });

            if (response.status === 404) {
                response = await fetch('http://localhost:3000/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, senha })
                });
            }

            const data = await response.json();

            if (!response.ok) {
                alert(data.erro || data.mensagem || 'E-mail ou senha incorretos.');
                return false;
            }

            const usuario = data.usuario || data.user || data.data || data;
            Auth.setUser(usuario);

            if (Auth.isAdmin(usuario)) {
                sessionStorage.removeItem('redirect_after_login');
                window.location.replace('admin.html');
            } else {
                const redirect = sessionStorage.getItem('redirect_after_login') || 'index.html';
                sessionStorage.removeItem('redirect_after_login');
                window.location.replace(redirect);
            }
            return true;
        } catch (error) {
            console.error(error);
            alert('Não foi possível conectar ao servidor de autenticação.');
            return false;
        }
    },

    logout: () => {
        localStorage.removeItem('guga_user_logged');
        localStorage.removeItem('guga_user_data');
        localStorage.removeItem('usuario_logado');
        localStorage.removeItem('usuario');
        localStorage.removeItem('user');
        sessionStorage.clear();
        window.location.replace('login.html');
    }
};

// Configurações executadas ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    // 1. Atualiza os botões de cabeçalho
    const userActionsContainer = document.getElementById('header-user-actions');
    
    if (userActionsContainer) {
        if (Auth.isLoggedIn()) {
            const user = Auth.getUser();
            const isAdmin = Auth.isAdmin(user);
            const nomeExibicao = user.name || user.nome || 'Cliente';

            userActionsContainer.innerHTML = `
                <span style="font-weight: 700; color: var(--azul-escuro-guga); display: inline-flex; align-items: center; gap: 0.4rem;">
                    <i class="fa-solid fa-user" style="color: var(--azul-claro-guga);"></i> Olá, 
                    <a href="perfil.html" title="Clique para editar seus dados" style="color: var(--azul-escuro-guga); text-decoration: underline; cursor: pointer;">
                        ${nomeExibicao}
                    </a>
                    ${isAdmin ? '<small style="background: var(--rosa-guga); color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px;">ADM</small>' : ''}
                </span>
                ${isAdmin ? '<a href="admin.html" class="btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">Painel Adm</a>' : ''}
                <button onclick="Auth.logout()" class="btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">Sair</button>
            `;
        } else {
            userActionsContainer.innerHTML = `
                <a href="login.html" class="btn-secondary">
                    <i class="fa-regular fa-user"></i> Entrar
                </a>
            `;
        }
    }

    // 2. Intercepta qualquer clique em botões ou links relativos a Orçamento
    document.addEventListener('click', (event) => {
        const clickable = event.target.closest('a, button, .btn');
        if (!clickable) return;

        const href = (clickable.getAttribute('href') || '').toLowerCase();
        const text = (clickable.innerText || clickable.textContent || '').toLowerCase();

        // Identifica se é o botão do topo (orcamento) ou o de adicionar item
        const isOrcamentoClick = href.includes('orcamento') || text.includes('orçamento') || text.includes('adicionar');

        if (isOrcamentoClick && !Auth.isLoggedIn()) {
            event.preventDefault();
            event.stopPropagation();
            Auth.requireAuth();
        }
    }, true);
});