const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Listar todos os usuários cadastrados
router.get('/', async (req, res) => {
    try {
        const query = 'SELECT id, nome, email, telefone, cpf_cnpj, tipo_usuario FROM usuarios ORDER BY id DESC';
        const [usuarios] = await db.query(query);
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar usuários', detalhe: error.message });
    }
});

// Alterar tipo do usuário (cliente <-> admin)
router.put('/:id/tipo', async (req, res) => {
    const { id } = req.params;
    const { tipo_usuario } = req.body;

    if (!['cliente', 'admin'].includes(tipo_usuario)) {
        return res.status(400).json({ erro: 'Tipo de usuário inválido.' });
    }

    try {
        const query = 'UPDATE usuarios SET tipo_usuario = ? WHERE id = ?';
        await db.query(query, [tipo_usuario, id]);

        res.json({ mensagem: `Tipo de usuário alterado para ${tipo_usuario} com sucesso!` });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar permissão', detalhe: error.message });
    }
});

// ROTA DE EXCLUSÃO DE USUÁRIO
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({ erro: 'ID do usuário não fornecido.' });
    }

    try {
        const query = 'DELETE FROM usuarios WHERE id = ?';
        const [resultado] = await db.query(query, [id]);

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ erro: 'Usuário não encontrado.' });
        }

        return res.status(200).json({ mensagem: 'Usuário excluído com sucesso!' });
    } catch (error) {
        console.error('Erro ao excluir usuário:', error.message);
        return res.status(500).json({ 
            erro: 'Erro no banco de dados ao tentar excluir o usuário.',
            detalhe: error.message 
        });
    }
});

module.exports = router;