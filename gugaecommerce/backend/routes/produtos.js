const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET: Listar todos os produtos
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM produtos ORDER BY id DESC');
        
        const produtosFormatados = rows.map(p => ({
            id: p.id,
            nome: p.nome,
            categoria: p.categoria || 'Geral',
            categoria_id: p.categoria_id,
            descricao: p.descricao,
            imagem: p.imagem_url,
            status: p.status,
            opcoes: p.descricao && p.descricao.includes('Opções: ') 
                ? p.descricao.replace('Opções: ', '').split(', ') 
                : []
        }));

        res.json(produtosFormatados);
    } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        res.status(500).json({ error: 'Erro ao buscar produtos no banco de dados.' });
    }
});

// GET: Buscar produto por ID
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM produtos WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Produto não encontrado.' });
        }
        
        const p = rows[0];
        res.json({
            id: p.id,
            nome: p.nome,
            categoria: p.categoria || 'Geral',
            categoria_id: p.categoria_id,
            descricao: p.descricao,
            imagem: p.imagem_url,
            status: p.status,
            opcoes: p.descricao && p.descricao.includes('Opções: ') 
                ? p.descricao.replace('Opções: ', '').split(', ') 
                : []
        });
    } catch (error) {
        console.error('Erro ao buscar produto:', error);
        res.status(500).json({ error: 'Erro ao consultar o produto.' });
    }
});

// POST: Cadastrar novo produto no MySQL
router.post('/', async (req, res) => {
    const { nome, categoria, categoria_id, descricao, imagem, imagem_url, opcoes } = req.body;

    if (!nome) {
        return res.status(400).json({ error: 'O nome do produto é obrigatório.' });
    }

    const nomeCategoria = categoria || 'Geral';
    const idCategoriaValida = categoria_id ? Number(categoria_id) : 1;
    const urlImagemFinal = imagem || imagem_url || null;
    const listaOpcoesTexto = Array.isArray(opcoes) ? opcoes.join(', ') : (opcoes || '');
    const descricaoFinal = listaOpcoesTexto 
        ? `Opções: ${listaOpcoesTexto}` 
        : (descricao || 'Produto para locação');

    const query = `
        INSERT INTO produtos 
        (categoria_id, categoria, nome, descricao, quantidade_estoque, imagem_url, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        idCategoriaValida,
        nomeCategoria,
        nome,
        descricaoFinal,
        1,
        urlImagemFinal,
        'ativo'
    ];

    try {
        const [result] = await db.query(query, values);
        return res.status(201).json({
            mensagem: 'Produto cadastrado com sucesso!',
            id: result.insertId
        });
    } catch (error) {
        console.error('Erro de SQL ao inserir produto:', error);
        return res.status(500).json({
            error: 'Erro ao cadastrar produto no banco de dados.',
            detalhe: error.message
        });
    }
});

// PUT: Atualizar produto existente
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, categoria, categoria_id, descricao, imagem, imagem_url, opcoes } = req.body;

    const nomeCategoria = categoria || 'Geral';
    const idCategoriaValida = categoria_id ? Number(categoria_id) : 1;
    const urlImagemFinal = imagem || imagem_url || null;
    const listaOpcoesTexto = Array.isArray(opcoes) ? opcoes.join(', ') : (opcoes || '');
    const descricaoFinal = listaOpcoesTexto 
        ? `Opções: ${listaOpcoesTexto}` 
        : (descricao || 'Produto para locação');

    const query = `
        UPDATE produtos 
        SET nome = ?, categoria = ?, categoria_id = ?, descricao = ?, imagem_url = ?
        WHERE id = ?
    `;

    try {
        await db.query(query, [nome, nomeCategoria, idCategoriaValida, descricaoFinal, urlImagemFinal, id]);
        return res.json({ mensagem: 'Produto atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        return res.status(500).json({ error: 'Erro ao atualizar produto no banco de dados.' });
    }
});

// DELETE: Excluir produto
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM produtos WHERE id = ?', [req.params.id]);
        return res.json({ mensagem: 'Produto removido com sucesso!' });
    } catch (error) {
        console.error('Erro ao excluir produto:', error);
        return res.status(500).json({ error: 'Erro ao excluir produto do banco de dados.' });
    }
});

module.exports = router;