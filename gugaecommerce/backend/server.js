const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./config/db'); 

const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const orcamentosRoutes = require('./routes/orcamentos');
const categoriasRoutes = require('./routes/categorias');
const produtosRoutes = require('./routes/produtos');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/orcamentos', orcamentosRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/produtos', produtosRoutes);

// --- ROTA DE PERFIL (Atualização de Dados do Cliente) ---
const atualizarPerfilHandler = async (req, res) => {
    const { id, nome, email, telefone, cpf, cpf_cnpj, novaSenha } = req.body;

    if (!id) {
        return res.status(400).json({ erro: 'ID do usuário não fornecido.' });
    }

    const docFinal = cpf_cnpj || cpf || null;

    try {
        if (novaSenha && novaSenha.trim() !== '') {
            const query = `
                UPDATE usuarios 
                SET nome = ?, email = ?, telefone = ?, cpf_cnpj = ?, senha_hash = ? 
                WHERE id = ?
            `;
            await db.query(query, [nome, email, telefone || null, docFinal, novaSenha, id]);
        } else {
            const query = `
                UPDATE usuarios 
                SET nome = ?, email = ?, telefone = ?, cpf_cnpj = ? 
                WHERE id = ?
            `;
            await db.query(query, [nome, email, telefone || null, docFinal, id]);
        }

        return res.status(200).json({ mensagem: 'Perfil atualizado com sucesso!' });

    } catch (error) {
        console.error('Erro ao atualizar perfil do usuário:', error.message);
        return res.status(500).json({ 
            erro: 'Erro interno no banco de dados ao salvar as alterações.',
            detalhe: error.message 
        });
    }
};

app.put('/api/usuario/perfil', atualizarPerfilHandler);
app.put('/api/usuarios/perfil', atualizarPerfilHandler);

// Rota raiz para teste
app.get('/', (req, res) => {
    res.send('Servidor do GuGa Decorações rodando!');
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});