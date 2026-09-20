const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ==========================================
// 1. GET: Listar todos os orçamentos/pedidos (Painel Admin)
// ==========================================
router.get('/', async (req, res) => {
    try {
        const queryPedidos = `
            SELECT 
                p.id,
                p.usuario_id,
                p.endereco_id,
                p.tipo_solicitacao,
                p.data_evento,
                p.data_devolucao,
                p.status,
                p.valor_total,
                p.observacoes_cliente AS observacoes,
                p.resposta_funcionario,
                p.criado_em AS data_solicitacao,
                p.atualizado_em,
                u.nome AS cliente_nome,
                u.email,
                u.telefone AS contato
            FROM pedidos_orcamentos p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            ORDER BY p.id DESC
        `;

        const [pedidos] = await db.query(queryPedidos);

        if (pedidos.length === 0) {
            return res.json([]);
        }

        const pedidoIds = pedidos.map(p => p.id);
        const queryItens = `
            SELECT 
                i.id,
                i.pedido_id,
                i.produto_id,
                i.kit_id,
                i.quantidade,
                i.preco_unitario,
                i.detalhe_customizado,
                COALESCE(prod.nome, kit.nome, CONCAT('Item #', COALESCE(i.produto_id, i.kit_id, i.id))) AS nome,
                prod.imagem_url
            FROM itens_pedido i
            LEFT JOIN produtos prod ON i.produto_id = prod.id
            LEFT JOIN kits kit ON i.kit_id = kit.id
            WHERE i.pedido_id IN (?)
        `;

        let itens = [];
        try {
            const [itensResult] = await db.query(queryItens, [pedidoIds]);
            itens = itensResult;
        } catch (itemErr) {
            const queryItensSimples = `
                SELECT 
                    id,
                    pedido_id,
                    produto_id,
                    quantidade,
                    CONCAT('Produto ID: ', COALESCE(produto_id, id)) AS nome
                FROM itens_pedido 
                WHERE pedido_id IN (?)
            `;
            const [itensSimplesResult] = await db.query(queryItensSimples, [pedidoIds]);
            itens = itensSimplesResult;
        }

        const pedidosComItens = pedidos.map(p => ({
            ...p,
            itens: itens.filter(item => item.pedido_id === p.id)
        }));

        res.json(pedidosComItens);
    } catch (error) {
        console.error('Erro ao buscar pedidos/orçamentos:', error.message);
        res.status(500).json({ 
            erro: 'Erro ao buscar orçamentos no banco de dados.', 
            detalhe: error.message 
        });
    }
});

// ==========================================
// 2. GET: Listar histórico do usuário logado (Site / Cliente)
// ==========================================
router.get('/usuario/:usuario_id', async (req, res) => {
    const { usuario_id } = req.params;

    try {
        const queryPedidos = `
            SELECT 
                p.id,
                p.tipo_solicitacao,
                p.data_evento,
                p.data_devolucao,
                p.status,
                p.valor_total,
                p.observacoes_cliente AS observacoes,
                p.resposta_funcionario,
                p.criado_em AS data_solicitacao
            FROM pedidos_orcamentos p
            WHERE p.usuario_id = ?
            ORDER BY p.id DESC
        `;

        const [pedidos] = await db.query(queryPedidos, [usuario_id]);

        if (pedidos.length === 0) {
            return res.json([]);
        }

        const pedidoIds = pedidos.map(p => p.id);
        
        let itens = [];
        try {
            const queryItens = `
                SELECT 
                    i.id,
                    i.pedido_id,
                    i.produto_id,
                    i.quantidade,
                    i.preco_unitario,
                    COALESCE(prod.nome, CONCAT('Item #', COALESCE(i.produto_id, i.id))) AS nome,
                    prod.imagem_url
                FROM itens_pedido i
                LEFT JOIN produtos prod ON i.produto_id = prod.id
                WHERE i.pedido_id IN (?)
            `;
            const [itensResult] = await db.query(queryItens, [pedidoIds]);
            itens = itensResult;
        } catch (itemErr) {
            const queryItensSimples = `
                SELECT 
                    id,
                    pedido_id,
                    produto_id,
                    quantidade,
                    CONCAT('Produto ID: ', COALESCE(produto_id, id)) AS nome
                FROM itens_pedido 
                WHERE pedido_id IN (?)
            `;
            const [itensSimplesResult] = await db.query(queryItensSimples, [pedidoIds]);
            itens = itensSimplesResult;
        }

        const pedidosComItens = pedidos.map(p => ({
            ...p,
            itens: itens.filter(item => item.pedido_id === p.id)
        }));

        res.json(pedidosComItens);
    } catch (error) {
        console.error('Erro ao buscar histórico do usuário:', error.message);
        res.status(500).json({ erro: 'Erro ao buscar histórico de orçamentos.' });
    }
});

// ==========================================
// 3. POST: Criar uma nova solicitação de orçamento (Site / Cliente)
// ==========================================
router.post('/', async (req, res) => {
    const { 
        usuario_id, 
        user_id,
        cliente_id,
        endereco_id, 
        tipo_solicitacao, 
        data_evento, 
        data_devolucao, 
        observacoes_cliente, 
        itens 
    } = req.body;

    const idUsuarioFinal = usuario_id || user_id || cliente_id;

    if (!idUsuarioFinal) {
        return res.status(400).json({ erro: 'O ID do usuário é obrigatório para solicitar orçamento.' });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const queryPedido = `
            INSERT INTO pedidos_orcamentos 
            (usuario_id, endereco_id, tipo_solicitacao, data_evento, data_devolucao, status, observacoes_cliente, criado_em) 
            VALUES (?, ?, ?, ?, ?, 'Pendente', ?, NOW())
        `;
        
        const [resPedido] = await connection.query(queryPedido, [
            idUsuarioFinal,
            endereco_id || null,
            tipo_solicitacao || 'RETIRADA',
            data_evento || null,
            data_devolucao || null,
            observacoes_cliente || null
        ]);

        const pedidoId = resPedido.insertId;

        if (Array.isArray(itens) && itens.length > 0) {
            for (const item of itens) {
                const produtoId = item.produto_id || item.id || null;
                const kitId = item.kit_id || null;
                const quantidade = item.quantidade || item.qtd || 1;
                const precoUnitario = item.preco_unitario || item.preco || 0.00;
                const detalheCustomizado = item.detalhe_customizado || (Array.isArray(item.opcoes) ? item.opcoes.join(', ') : item.opcoes) || null;

                try {
                    const queryItemCompleta = `
                        INSERT INTO itens_pedido 
                        (pedido_id, produto_id, kit_id, quantidade, preco_unitario, detalhe_customizado) 
                        VALUES (?, ?, ?, ?, ?, ?)
                    `;
                    await connection.query(queryItemCompleta, [
                        pedidoId,
                        produtoId,
                        kitId,
                        quantidade,
                        precoUnitario,
                        detalheCustomizado
                    ]);
                } catch (errItem) {
                    // Fallback caso colunas opcionais (preco_unitario, kit_id, detalhe_customizado) não existam
                    const queryItemSimples = `
                        INSERT INTO itens_pedido 
                        (pedido_id, produto_id, quantidade) 
                        VALUES (?, ?, ?)
                    `;
                    await connection.query(queryItemSimples, [
                        pedidoId,
                        produtoId,
                        quantidade
                    ]);
                }
            }
        }

        await connection.commit();
        res.status(201).json({ 
            mensagem: 'Solicitação de orçamento criada com sucesso!', 
            pedido_id: pedidoId 
        });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao cadastrar orçamento:', error.message);
        res.status(500).json({ 
            erro: 'Erro ao salvar orçamento no banco de dados.', 
            detalhe: error.message 
        });
    } finally {
        connection.release();
    }
});

// ==========================================
// 4. PUT: Atualizar o status e o valor final do orçamento (Painel Admin)
// ==========================================
router.put('/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, resposta_funcionario, valor_total } = req.body;

    if (!status) {
        return res.status(400).json({ erro: 'O status é obrigatório.' });
    }

    try {
        let query = 'UPDATE pedidos_orcamentos SET status = ?, atualizado_em = NOW()';
        const params = [status];

        if (resposta_funcionario !== undefined) {
            query += ', resposta_funcionario = ?';
            params.push(resposta_funcionario);
        }

        if (valor_total !== undefined && valor_total !== null && valor_total !== '') {
            query += ', valor_total = ?';
            params.push(valor_total);
        }

        query += ' WHERE id = ?';
        params.push(id);

        await db.query(query, params);
        res.json({ mensagem: 'Orçamento e valor atualizados com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar status e valor:', error.message);
        res.status(500).json({ 
            erro: 'Erro ao atualizar orçamento no banco de dados.', 
            detalhe: error.message 
        });
    }
});

// ==========================================
// 5. DELETE: Excluir orçamento e seus itens (Painel Admin)
// ==========================================
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await db.query('DELETE FROM itens_pedido WHERE pedido_id = ?', [id]);

        const [resultado] = await db.query('DELETE FROM pedidos_orcamentos WHERE id = ?', [id]);

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ erro: 'Orçamento não encontrado.' });
        }

        res.json({ mensagem: 'Orçamento e seus itens foram excluídos com sucesso!' });
    } catch (error) {
        console.error('Erro ao excluir orçamento:', error.message);
        res.status(500).json({ 
            erro: 'Erro ao excluir orçamento no banco de dados.', 
            detalhe: error.message 
        });
    }
});

module.exports = router;