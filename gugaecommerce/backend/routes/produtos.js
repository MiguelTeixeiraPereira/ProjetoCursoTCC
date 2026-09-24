const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Ajuste o caminho do seu arquivo de banco se necessário

// ==========================================
// 1. GET: Listar todos os produtos
// ==========================================
router.get('/', async (req, res) => {
    try {
        const [produtos] = await db.query('SELECT * FROM produtos ORDER BY id DESC');
        
        const formatados = produtos.map(p => {
            let opcoesArray = [];
            if (p.opcoes) {
                try {
                    opcoesArray = typeof p.opcoes === 'string' ? JSON.parse(p.opcoes) : p.opcoes;
                } catch (e) {
                    opcoesArray = String(p.opcoes).split(',').map(s => s.trim());
                }
            }

            return {
                id: p.id,
                nome: p.nome,
                categoria: p.categoria || 'Geral',
                imagem_url: p.imagem_url || p.imagem,
                imagem: p.imagem_url || p.imagem,
                imagem2: p.imagem2 || null,
                imagem3: p.imagem3 || null,
                opcoes: opcoesArray
            };
        });

        res.json(formatados);
    } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        res.status(500).json({ erro: 'Erro ao buscar produtos no banco de dados.' });
    }
});

// ==========================================
// 2. GET: Buscar produto por ID
// ==========================================
router.get('/:id', async (req, res) => {
    try {
        const [produtos] = await db.query('SELECT * FROM produtos WHERE id = ?', [req.params.id]);
        if (produtos.length === 0) return res.status(404).json({ erro: 'Produto não encontrado' });

        const p = produtos[0];
        let opcoesArray = [];
        if (p.opcoes) {
            try {
                opcoesArray = typeof p.opcoes === 'string' ? JSON.parse(p.opcoes) : p.opcoes;
            } catch (e) {
                opcoesArray = String(p.opcoes).split(',').map(s => s.trim());
            }
        }

        res.json({
            id: p.id,
            nome: p.nome,
            categoria: p.categoria || 'Geral',
            imagem_url: p.imagem_url || p.imagem,
            imagem: p.imagem_url || p.imagem,
            imagem2: p.imagem2 || null,
            imagem3: p.imagem3 || null,
            opcoes: opcoesArray
        });
    } catch (error) {
        console.error('Erro ao buscar produto por ID:', error);
        res.status(500).json({ erro: 'Erro ao buscar o produto.' });
    }
});

// ==========================================
// 3. POST: Cadastrar novo produto
// ==========================================
router.post('/', async (req, res) => {
    const { nome, categoria, opcoes, imagem, imagem_url, imagem2, imagem3 } = req.body;
    const imgPrincipal = imagem_url || imagem || null;
    const opcoesStr = Array.isArray(opcoes) ? JSON.stringify(opcoes) : (opcoes || '');

    try {
        const query = `
            INSERT INTO produtos (nome, categoria, opcoes, imagem_url, imagem2, imagem3) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(query, [
            nome, 
            categoria || 'Geral', 
            opcoesStr, 
            imgPrincipal, 
            imagem2 || null, 
            imagem3 || null
        ]);

        res.status(201).json({ id: result.insertId, mensagem: 'Produto cadastrado com sucesso!' });
    } catch (error) {
        console.error('Erro ao salvar produto:', error);
        res.status(500).json({ erro: 'Erro ao cadastrar produto no banco.' });
    }
});

// ==========================================
// 4. PUT: Atualizar produto existente
// ==========================================
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, categoria, opcoes, imagem, imagem_url, imagem2, imagem3 } = req.body;
    const imgPrincipal = imagem_url || imagem || null;
    const opcoesStr = Array.isArray(opcoes) ? JSON.stringify(opcoes) : (opcoes || '');

    try {
        const query = `
            UPDATE produtos 
            SET nome = ?, categoria = ?, opcoes = ?, imagem_url = ?, imagem2 = ?, imagem3 = ? 
            WHERE id = ?
        `;
        await db.query(query, [
            nome, 
            categoria || 'Geral', 
            opcoesStr, 
            imgPrincipal, 
            imagem2 || null, 
            imagem3 || null, 
            id
        ]);

        res.json({ mensagem: 'Produto atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        res.status(500).json({ erro: 'Erro ao atualizar produto no banco.' });
    }
});

// ==========================================
// 5. DELETE: Excluir produto
// ==========================================
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM produtos WHERE id = ?', [req.params.id]);
        res.json({ mensagem: 'Produto excluído com sucesso!' });
    } catch (error) {
        console.error('Erro ao excluir produto:', error);
        res.status(500).json({ erro: 'Erro ao excluir produto.' });
    }
});

module.exports = router;