const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Listar todas as categorias
router.get('/', async (req, res) => {
    try {
        const [categorias] = await db.query('SELECT * FROM categorias ORDER BY nome ASC');
        res.json(categorias);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar categorias.', detalhe: error.message });
    }
});

// Cadastrar nova categoria
router.post('/', async (req, res) => {
    const { nome, descricao } = req.body;

    if (!nome) {
        return res.status(400).json({ erro: 'O nome da categoria é obrigatório.' });
    }

    try {
        const [result] = await db.query('INSERT INTO categorias (nome, descricao) VALUES (?, ?)', [nome, descricao || null]);
        res.status(201).json({ mensagem: 'Categoria criada com sucesso!', id: result.insertId });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao cadastrar categoria.', detalhe: error.message });
    }
});

module.exports = router;