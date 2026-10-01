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

// --- HELPER 1: REGISTO AUTOMÁTICO DE AUDITORIA E LOGS ---
async function registrarLog(usuarioNome, acao, detalhes) {
    try {
        const query = `INSERT INTO logs_auditoria (usuario_nome, acao, detalhes) VALUES (?, ?, ?)`;
        await db.query(query, [usuarioNome || 'Sistema / Admin', acao, detalhes || '']);
    } catch (err) {
        console.error('Erro ao gravar log de auditoria:', err.message);
    }
}

// --- HELPER 2: FILTRO DE DATAS PARA RELATÓRIOS ---
function aplicarFiltroData(colunaData = 'criado_em', inicio, fim) {
    let sql = '';
    const params = [];
    if (inicio && inicio !== '') {
        sql += ` AND ${colunaData} >= ?`;
        params.push(`${inicio} 00:00:00`);
    }
    if (fim && fim !== '') {
        sql += ` AND ${colunaData} <= ?`;
        params.push(`${fim} 23:59:59`);
    }
    return { sql, params };
}

// =========================================================================
// ROTAS PRIORITÁRIAS DE PRODUTOS E CATÁLOGO (SEM PREÇO PÚBLICO)
// =========================================================================

// 1. LISTAR TODOS OS PRODUTOS DO CATÁLOGO
app.get('/api/produtos', async (req, res) => {
    try {
        const query = `
            SELECT 
                id, 
                nome, 
                descricao, 
                categoria, 
                COALESCE(imagem_url, '') AS imagem_url, 
                COALESCE(status_manutencao, 'DISPONIVEL') AS status_manutencao, 
                COALESCE(quantidade_estoque, 1) AS quantidade_estoque 
            FROM produtos 
            ORDER BY id DESC;
        `;
        const results = await db.query(query);
        const rows = Array.isArray(results[0]) ? results[0] : results;
        return res.status(200).json(rows);
    } catch (error) {
        console.error('Erro ao buscar produtos:', error.message);
        return res.status(500).json({ erro: 'Erro ao buscar produtos do catálogo.', detalhe: error.message });
    }
});

// 2. BUSCAR UM PRODUTO ESPECÍFICO POR ID
app.get('/api/produtos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT 
                id, 
                nome, 
                descricao, 
                categoria, 
                COALESCE(imagem_url, '') AS imagem_url, 
                COALESCE(imagem2, '') AS imagem2, 
                COALESCE(imagem3, '') AS imagem3, 
                COALESCE(opcoes, '') AS opcoes, 
                COALESCE(status_manutencao, 'DISPONIVEL') AS status_manutencao, 
                COALESCE(quantidade_estoque, 1) AS quantidade_estoque 
            FROM produtos 
            WHERE id = ?;
        `;
        const results = await db.query(query, [id]);
        const rows = Array.isArray(results[0]) ? results[0] : results;

        if (!rows || rows.length === 0) {
            return res.status(404).json({ erro: 'Produto não encontrado.' });
        }

        return res.status(200).json(rows[0]);
    } catch (error) {
        console.error('Erro ao buscar produto por ID:', error.message);
        return res.status(500).json({ erro: 'Erro ao buscar detalhes do produto.' });
    }
});

// =========================================================================
// ROTAS PRIORITÁRIAS DE ORÇAMENTOS
// =========================================================================

// 1. LISTAR TODOS OS ORÇAMENTOS COM ITENS, DATAS E CAMPOS FINANCEIROS COMPLETOS
app.get('/api/orcamentos', async (req, res) => {
    try {
        const queryOrcamentos = `
            SELECT 
                po.*, 
                COALESCE(po.criado_em, NOW()) AS data_solicitacao,
                COALESCE(u.nome, 'Cliente') AS cliente_nome, 
                COALESCE(u.nome, 'Cliente') AS cliente,
                u.telefone AS contato,
                u.telefone,
                u.email
            FROM pedidos_orcamentos po
            LEFT JOIN usuarios u ON po.usuario_id = u.id
            ORDER BY po.id DESC;
        `;
        const results = await db.query(queryOrcamentos);
        const orcamentos = Array.isArray(results[0]) ? results[0] : results;

        // Associa os itens e opções personalizadas de cada orçamento
        for (let orc of orcamentos) {
            const queryItens = `
                SELECT ip.*, p.nome AS produto_nome 
                FROM itens_pedido ip 
                LEFT JOIN produtos p ON ip.produto_id = p.id 
                WHERE ip.pedido_id = ?;
            `;
            const resItens = await db.query(queryItens, [orc.id]);
            const itensRows = Array.isArray(resItens[0]) ? resItens[0] : resItens;
            
            orc.itens = itensRows.map(i => ({
                nome: i.produto_nome || i.nome || 'Item',
                quantidade: i.quantidade || 1,
                detalhe_customizado: i.detalhe_customizado || i.opcoes || ''
            }));
        }

        return res.status(200).json(orcamentos);
    } catch (error) {
        console.error('Erro ao buscar orçamentos:', error.message);
        return res.status(500).json({ erro: 'Erro ao carregar orçamentos.', detalhe: error.message });
    }
});

// 1.1. BUSCAR ORÇAMENTOS DE UM UTILIZADOR ESPECÍFICO (CLIENTE) COM MÉTODO DE PAGAMENTO E DADOS FINANCEIROS SINCRONIZADOS
app.get('/api/orcamentos/usuario/:usuario_id', async (req, res) => {
    try {
        const { usuario_id } = req.params;
        const query = `
            SELECT 
                po.*, 
                COALESCE(po.criado_em, NOW()) AS data_solicitacao,
                COALESCE(po.status_pagamento, 'PENDENTE') AS status_pagamento,
                COALESCE(po.metodo_pagamento, 'PIX') AS metodo_pagamento,
                COALESCE(po.valor_sinal, 0) AS valor_sinal,
                COALESCE(po.valor_restante, po.valor_total, 0) AS valor_restante
            FROM pedidos_orcamentos po
            WHERE po.usuario_id = ?
            ORDER BY po.id DESC;
        `;
        const results = await db.query(query, [usuario_id]);
        const orcamentos = Array.isArray(results[0]) ? results[0] : results;

        for (let orc of orcamentos) {
            const queryItens = `
                SELECT ip.*, p.nome AS produto_nome 
                FROM itens_pedido ip 
                LEFT JOIN produtos p ON ip.produto_id = p.id 
                WHERE ip.pedido_id = ?;
            `;
            const resItens = await db.query(queryItens, [orc.id]);
            const itensRows = Array.isArray(resItens[0]) ? resItens[0] : resItens;
            
            orc.itens = itensRows.map(i => ({
                nome: i.produto_nome || i.nome || 'Item',
                quantidade: i.quantidade || 1,
                detalhe_customizado: i.detalhe_customizado || i.opcoes || ''
            }));
        }

        return res.status(200).json(orcamentos);
    } catch (error) {
        console.error('Erro ao buscar orçamentos do usuário:', error.message);
        return res.status(500).json({ erro: 'Erro ao carregar histórico.' });
    }
});

// 2. ATUALIZAR STATUS, FINANCEIRO (SINAL/PAGAMENTO) E RESPOSTA DO ORÇAMENTO
app.put('/api/orcamentos/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            status, 
            valor_total, 
            valor_sinal, 
            status_pagamento, 
            metodo_pagamento, 
            resposta_funcionario, 
            usuario_admin 
        } = req.body;

        const vTotal = parseFloat(valor_total) || 0;
        const vSinal = parseFloat(valor_sinal) || 0;
        const vRestante = Math.max(0, vTotal - vSinal);

        const query = `
            UPDATE pedidos_orcamentos 
            SET status = ?, 
                valor_total = ?, 
                valor_sinal = ?, 
                valor_restante = ?, 
                status_pagamento = ?, 
                metodo_pagamento = ?, 
                resposta_funcionario = ?, 
                atualizado_em = NOW()
            WHERE id = ?;
        `;
        await db.query(query, [
            status, 
            vTotal, 
            vSinal, 
            vRestante, 
            status_pagamento || 'PENDENTE', 
            metodo_pagamento || 'PIX', 
            resposta_funcionario || null, 
            id
        ]);

        await registrarLog(
            usuario_admin, 
            'ATUALIZAR_ORCAMENTO', 
            `Orçamento #${id} atualizado. Status: '${status}', Estado Pgto: '${status_pagamento}', Método: '${metodo_pagamento}', Total: R$ ${vTotal.toFixed(2)}, Sinal: R$ ${vSinal.toFixed(2)}.`
        );

        return res.status(200).json({ 
            mensagem: 'Orçamento e informações financeiras atualizados com sucesso!',
            valor_restante: vRestante
        });
    } catch (error) {
        console.error('Erro ao atualizar orçamento:', error.message);
        return res.status(500).json({ erro: 'Erro ao atualizar orçamento.', detalhe: error.message });
    }
});

// Rotas secundárias importadas
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/orcamentos', orcamentosRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/produtos', produtosRoutes);

// --- CONFIGURAÇÕES DA EMPRESA E CONTRATO ---
app.get('/api/configuracoes', async (req, res) => {
    try {
        const results = await db.query('SELECT * FROM configuracoes WHERE id = 1');
        const rows = Array.isArray(results[0]) ? results[0] : results;
        return res.status(200).json(rows[0] || {});
    } catch (error) {
        return res.status(500).json({ erro: 'Erro interno ao buscar configurações.' });
    }
});

app.put('/api/configuracoes', async (req, res) => {
    try {
        const { nome_empresa, chave_pix, telefone_whatsapp, endereco_loja, clausulas_contrato, usuario_admin } = req.body;
        const query = `
            UPDATE configuracoes 
            SET nome_empresa = ?, chave_pix = ?, telefone_whatsapp = ?, endereco_loja = ?, clausulas_contrato = ?
            WHERE id = 1;
        `;
        await db.query(query, [nome_empresa, chave_pix, telefone_whatsapp, endereco_loja, clausulas_contrato]);
        await registrarLog(usuario_admin, 'ALTERAR_CONFIGURACOES', 'Atualizou dados da empresa, chave PIX e cláusulas do contrato.');
        return res.status(200).json({ mensagem: 'Configurações atualizadas com sucesso!' });
    } catch (error) {
        return res.status(500).json({ erro: 'Erro interno ao salvar configurações.' });
    }
});

// --- LOGS DE AUDITORIA E SEGURANÇA ---
app.get('/api/logs', async (req, res) => {
    try {
        const results = await db.query('SELECT * FROM logs_auditoria ORDER BY criado_em DESC LIMIT 100');
        const rows = Array.isArray(results[0]) ? results[0] : results;
        return res.status(200).json(rows);
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao buscar logs de auditoria.' });
    }
});

// --- MANUTENÇÃO E ESTOQUE DOS PRODUTOS ---
app.put('/api/produtos/:id/manutencao', async (req, res) => {
    try {
        const { id } = req.params;
        const { status_manutencao, quantidade_estoque, usuario_admin } = req.body;
        
        let query = 'UPDATE produtos SET status_manutencao = ?';
        const params = [status_manutencao || 'DISPONIVEL'];

        if (quantidade_estoque !== undefined && quantidade_estoque !== null) {
            query += ', quantidade_estoque = ?';
            params.push(parseInt(quantidade_estoque));
        }

        query += ' WHERE id = ?';
        params.push(id);

        await db.query(query, params);
        await registrarLog(usuario_admin, 'ALTERAR_ESTOQUE_MANUTENCAO', `Produto #${id} alterado para status '${status_manutencao}'.`);
        return res.status(200).json({ mensagem: 'Estado do produto atualizado!' });
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao atualizar manutenção/estoque.' });
    }
});

// --- EMISSÃO DE CONTRATO EM DADOS (PDF) ---
app.get('/api/orcamentos/:id/contrato', async (req, res) => {
    try {
        const { id } = req.params;
        const queryOrc = `
            SELECT po.*, 
                   COALESCE(u.nome, 'Cliente') AS cliente_nome, 
                   u.email AS cliente_email, 
                   u.telefone AS cliente_telefone, 
                   u.cpf_cnpj AS cliente_documento
            FROM pedidos_orcamentos po
            LEFT JOIN usuarios u ON po.usuario_id = u.id
            WHERE po.id = ?;
        `;
        const queryItens = `
            SELECT ip.*, p.nome AS produto_nome 
            FROM itens_pedido ip 
            LEFT JOIN produtos p ON ip.produto_id = p.id 
            WHERE ip.pedido_id = ?;
        `;
        const queryConfig = 'SELECT * FROM configuracoes WHERE id = 1;';

        const [resOrc, resItens, resConfig] = await Promise.all([
            db.query(queryOrc, [id]),
            db.query(queryItens, [id]),
            db.query(queryConfig)
        ]);

        const rowsOrc = Array.isArray(resOrc[0]) ? resOrc[0] : resOrc;
        const rowsItens = Array.isArray(resItens[0]) ? resItens[0] : resItens;
        const rowsConfig = Array.isArray(resConfig[0]) ? resConfig[0] : resConfig;

        if (!rowsOrc || rowsOrc.length === 0) {
            return res.status(404).json({ erro: 'Orçamento não encontrado.' });
        }

        return res.status(200).json({
            orcamento: rowsOrc[0],
            itens: rowsItens,
            empresa: rowsConfig[0] || {}
        });
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao gerar dados do contrato.' });
    }
});

// --- CALENDÁRIO VISUAL DE EVENTOS ---
app.get('/api/calendario/eventos', async (req, res) => {
    try {
        const query = `
            SELECT 
                po.id, 
                COALESCE(u.nome, 'Cliente') AS cliente_nome, 
                po.data_evento AS start_date, 
                po.status,
                po.tipo_solicitacao,
                po.valor_total
            FROM pedidos_orcamentos po
            LEFT JOIN usuarios u ON po.usuario_id = u.id
            WHERE po.data_evento IS NOT NULL AND UPPER(po.status) != 'CANCELADO';
        `;
        const results = await db.query(query);
        const rows = Array.isArray(results[0]) ? results[0] : results;
        
        const eventosFormatados = rows.map(ev => {
            const st = (ev.status || '').toUpperCase();
            let corFundo = '#f59e0b';
            let corBorda = '#d97706';

            if (st === 'APROVADO' || st === 'CONCLUIDO') {
                corFundo = '#22c55e';
                corBorda = '#16a34a';
            }

            return {
                id: ev.id,
                title: `#${ev.id} - ${ev.cliente_nome} (${ev.tipo_solicitacao || 'FESTA'})`,
                start: ev.start_date,
                backgroundColor: corFundo,
                borderColor: corBorda
            };
        });

        return res.status(200).json(eventosFormatados);
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao buscar eventos do calendário.' });
    }
});

// --- GESTÃO DE CUPONS ---
app.get('/api/cupons', async (req, res) => {
    try {
        const results = await db.query('SELECT * FROM cupons ORDER BY criado_em DESC');
        return res.status(200).json(Array.isArray(results[0]) ? results[0] : results);
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao buscar cupons de desconto.' });
    }
});

app.post('/api/cupons', async (req, res) => {
    try {
        const { codigo, tipo_desconto, valor_desconto, limite_usos, usuario_admin } = req.body;
        const query = `INSERT INTO cupons (codigo, tipo_desconto, valor_desconto, limite_usos) VALUES (?, ?, ?, ?);`;
        await db.query(query, [codigo.toUpperCase().trim(), tipo_desconto || 'PORCENTAGEM', parseFloat(valor_desconto) || 0, parseInt(limite_usos) || 100]);
        await registrarLog(usuario_admin, 'CRIAR_CUPOM', `Criou o cupom '${codigo.toUpperCase()}'.`);
        return res.status(201).json({ mensagem: 'Cupom criado com sucesso!' });
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao criar cupom. Código pode ser duplicado.' });
    }
});

app.delete('/api/cupons/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM cupons WHERE id = ?', [req.params.id]);
        return res.status(200).json({ mensagem: 'Cupom removido!' });
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao remover cupom.' });
    }
});

// --- REGISTO DE DESPESAS OPERACIONAIS ---
app.get('/api/despesas', async (req, res) => {
    try {
        const results = await db.query('SELECT * FROM despesas ORDER BY data_despesa DESC');
        return res.status(200).json(Array.isArray(results[0]) ? results[0] : results);
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao buscar despesas.' });
    }
});

app.post('/api/despesas', async (req, res) => {
    try {
        const { descricao, valor, categoria, data_despesa, usuario_admin } = req.body;
        const query = `INSERT INTO despesas (descricao, valor, categoria, data_despesa) VALUES (?, ?, ?, ?);`;
        await db.query(query, [descricao, parseFloat(valor) || 0, categoria || 'OPERACIONAL', data_despesa]);
        await registrarLog(usuario_admin, 'CRIAR_DESPESA', `Lançou a despesa '${descricao}' de R$ ${parseFloat(valor).toFixed(2)}.`);
        return res.status(201).json({ mensagem: 'Despesa registrada com sucesso!' });
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao lançar despesa.' });
    }
});

app.delete('/api/despesas/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM despesas WHERE id = ?', [req.params.id]);
        return res.status(200).json({ mensagem: 'Despesa removida!' });
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao remover despesa.' });
    }
});

// --- DASHBOARD STATS ---
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const queryStats = `
            SELECT 
                (SELECT COUNT(*) FROM usuarios) AS total_usuarios,
                (SELECT COUNT(*) FROM produtos WHERE COALESCE(status_manutencao, 'DISPONIVEL') = 'DISPONIVEL') AS total_produtos,
                (SELECT COUNT(*) FROM pedidos_orcamentos WHERE UPPER(status) = 'PENDENTE' OR status IS NULL) AS total_pendentes,
                (SELECT COUNT(*) FROM pedidos_orcamentos) AS total_orcamentos,
                (SELECT SUM(COALESCE(valor_total, 0)) FROM pedidos_orcamentos WHERE UPPER(status) = 'APROVADO' AND DATE_FORMAT(criado_em, '%Y-%m') = DATE_FORMAT(CURRENT_DATE(), '%Y-%m')) AS faturamento_mes_atual,
                (SELECT COUNT(*) FROM pedidos_orcamentos WHERE (UPPER(status) = 'PENDENTE' OR status IS NULL) AND criado_em <= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS pendentes_urgentes
        `;
        const results = await db.query(queryStats);
        const rows = Array.isArray(results[0]) ? results[0] : results;
        return res.status(200).json(rows[0] || {});
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao buscar dados do dashboard.' });
    }
});

app.get('/api/dashboard/proximos-eventos', async (req, res) => {
    try {
        const query = `
            SELECT po.id, COALESCE(u.nome, 'Cliente') AS cliente_nome, po.data_evento, po.tipo_solicitacao, po.status, po.endereco_texto 
            FROM pedidos_orcamentos po 
            LEFT JOIN usuarios u ON po.usuario_id = u.id 
            WHERE po.data_evento >= CURRENT_DATE() 
            ORDER BY po.data_evento ASC LIMIT 10;
        `;
        const results = await db.query(query);
        return res.status(200).json(Array.isArray(results[0]) ? results[0] : results);
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao buscar próximos eventos.' });
    }
});

app.get('/api/dashboard/atividades-recentes', async (req, res) => {
    try {
        const query = `
            SELECT po.id, COALESCE(u.nome, 'Cliente') AS cliente_nome, po.status, po.valor_total, po.criado_em, po.atualizado_em 
            FROM pedidos_orcamentos po 
            LEFT JOIN usuarios u ON po.usuario_id = u.id 
            ORDER BY po.atualizado_em DESC LIMIT 8;
        `;
        const results = await db.query(query);
        return res.status(200).json(Array.isArray(results[0]) ? results[0] : results);
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao buscar atividades recentes.' });
    }
});

// --- RELATÓRIOS AVANÇADOS & LUCRO LÍQUIDO ---
app.get('/api/relatorios/panorama-avancado', async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        const filtro = aplicarFiltroData('criado_em', inicio, fim);
        const filtroDespesa = aplicarFiltroData('data_despesa', inicio, fim);

        const queryMain = `
            SELECT 
                COUNT(id) AS total_orcamentos,
                SUM(CASE WHEN UPPER(status) = 'APROVADO' THEN 1 ELSE 0 END) AS total_aprovados,
                SUM(CASE WHEN UPPER(status) = 'CANCELADO' THEN 1 ELSE 0 END) AS total_cancelados,
                SUM(CASE WHEN UPPER(status) = 'PENDENTE' OR status IS NULL THEN 1 ELSE 0 END) AS total_pendentes,
                SUM(CASE WHEN UPPER(status) = 'APROVADO' THEN COALESCE(valor_total, 0) ELSE 0 END) AS faturamento_total,
                AVG(CASE WHEN UPPER(status) = 'APROVADO' AND valor_total IS NOT NULL THEN valor_total ELSE NULL END) AS ticket_medio,
                AVG(CASE WHEN UPPER(status) = 'APROVADO' AND data_evento IS NOT NULL THEN DATEDIFF(data_evento, criado_em) ELSE NULL END) AS antecedencia_media_dias
            FROM pedidos_orcamentos
            WHERE 1=1 ${filtro.sql};
        `;

        const queryDespesas = `SELECT SUM(COALESCE(valor, 0)) AS total_despesas FROM despesas WHERE 1=1 ${filtroDespesa.sql};`;
        const queryPrevisao = `SELECT SUM(COALESCE(valor_total, 0)) AS faturamento_futuro FROM pedidos_orcamentos WHERE UPPER(status) = 'APROVADO' AND data_evento > CURRENT_DATE();`;

        const [resMain, resDesp, resFuturo] = await Promise.all([
            db.query(queryMain, filtro.params),
            db.query(queryDespesas, filtroDespesa.params),
            db.query(queryPrevisao)
        ]);

        const mainData = (Array.isArray(resMain[0]) ? resMain[0] : resMain)[0] || {};
        const despData = (Array.isArray(resDesp[0]) ? resDesp[0] : resDesp)[0] || {};
        const futData = (Array.isArray(resFuturo[0]) ? resFuturo[0] : resFuturo)[0] || {};

        const faturamentoBruto = parseFloat(mainData.faturamento_total || 0);
        const totalDespesas = parseFloat(despData.total_despesas || 0);

        return res.status(200).json({
            ...mainData,
            total_despesas: totalDespesas,
            lucro_liquido: faturamentoBruto - totalDespesas,
            faturamento_futuro: futData.faturamento_futuro || 0
        });
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao buscar panorama avançado.' });
    }
});

app.get('/api/relatorios/faturamento-categoria', async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        const filtro = aplicarFiltroData('po.criado_em', inicio, fim);
        const query = `
            SELECT COALESCE(p.categoria, 'Sem Categoria') AS categoria, SUM(ip.quantidade) AS qtd_itens, SUM(CASE WHEN UPPER(po.status) = 'APROVADO' THEN (ip.quantidade * COALESCE(ip.preco_unitario_cotado, 0)) ELSE 0 END) AS faturamento_estimado 
            FROM itens_pedido ip 
            JOIN pedidos_orcamentos po ON ip.pedido_id = po.id 
            LEFT JOIN produtos p ON ip.produto_id = p.id 
            WHERE 1=1 ${filtro.sql} 
            GROUP BY COALESCE(p.categoria, 'Sem Categoria') ORDER BY qtd_itens DESC;
        `;
        const results = await db.query(query, filtro.params);
        return res.status(200).json(Array.isArray(results[0]) ? results[0] : results);
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao buscar categorias.' });
    }
});

app.get('/api/relatorios/demanda-eventos', async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        const filtro = aplicarFiltroData('data_evento', inicio, fim);
        const query = `
            SELECT DATE_FORMAT(data_evento, '%Y-%m') AS mes_evento, COUNT(id) AS total_eventos, SUM(CASE WHEN UPPER(status) = 'APROVADO' THEN 1 ELSE 0 END) AS aprovados 
            FROM pedidos_orcamentos 
            WHERE data_evento IS NOT NULL ${filtro.sql} 
            GROUP BY DATE_FORMAT(data_evento, '%Y-%m') ORDER BY mes_evento ASC LIMIT 12;
        `;
        const results = await db.query(query, filtro.params);
        return res.status(200).json(Array.isArray(results[0]) ? results[0] : results);
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao buscar demanda de eventos.' });
    }
});

app.get('/api/relatorios/top-clientes', async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        const filtro = aplicarFiltroData('po.criado_em', inicio, fim);
        const query = `
            SELECT u.id AS usuario_id, u.nome, u.email, u.telefone, COUNT(po.id) AS total_pedidos, SUM(CASE WHEN UPPER(po.status) = 'APROVADO' THEN COALESCE(po.valor_total, 0) ELSE 0 END) AS total_gasto 
            FROM usuarios u 
            JOIN pedidos_orcamentos po ON u.id = po.usuario_id 
            WHERE 1=1 ${filtro.sql} 
            GROUP BY u.id, u.nome, u.email, u.telefone HAVING total_gasto > 0 ORDER BY total_gasto DESC LIMIT 5;
        `;
        const results = await db.query(query, filtro.params);
        return res.status(200).json(Array.isArray(results[0]) ? results[0] : results);
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao buscar top clientes.' });
    }
});

app.get('/api/relatorios/mensal-comparativo', async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        const filtro = aplicarFiltroData('criado_em', inicio, fim);
        const query = `
            SELECT DATE_FORMAT(criado_em, '%Y-%m') AS mes, SUM(CASE WHEN UPPER(status) = 'APROVADO' THEN 1 ELSE 0 END) AS aprovados, SUM(CASE WHEN UPPER(status) = 'CANCELADO' THEN 1 ELSE 0 END) AS cancelados, SUM(CASE WHEN UPPER(status) = 'PENDENTE' OR status IS NULL THEN 1 ELSE 0 END) AS pendentes, SUM(CASE WHEN UPPER(status) = 'APROVADO' THEN COALESCE(valor_total, 0) ELSE 0 END) AS faturamento 
            FROM pedidos_orcamentos 
            WHERE 1=1 ${filtro.sql} 
            GROUP BY DATE_FORMAT(criado_em, '%Y-%m') ORDER BY mes ASC LIMIT 12;
        `;
        const results = await db.query(query, filtro.params);
        return res.status(200).json(Array.isArray(results[0]) ? results[0] : results);
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao buscar comparativo mensal.' });
    }
});

app.get('/api/relatorios/produtos-mais-alugados', async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        const filtro = aplicarFiltroData('po.criado_em', inicio, fim);
        const query = `
            SELECT p.nome AS produto, SUM(ip.quantidade) AS total_quantidade 
            FROM itens_pedido ip 
            JOIN pedidos_orcamentos po ON ip.pedido_id = po.id 
            JOIN produtos p ON ip.produto_id = p.id 
            WHERE UPPER(po.status) = 'APROVADO' ${filtro.sql} 
            GROUP BY p.id, p.nome ORDER BY total_quantidade DESC LIMIT 5;
        `;
        const results = await db.query(query, filtro.params);
        return res.status(200).json(Array.isArray(results[0]) ? results[0] : results);
    } catch (error) {
        return res.status(500).json({ erro: 'Erro ao buscar produtos mais alugados.' });
    }
});

// --- PERFIL DO UTILIZADOR ---
const atualizarPerfilHandler = async (req, res) => {
    const { id, nome, email, telefone, cpf, cpf_cnpj, novaSenha } = req.body;
    if (!id) return res.status(400).json({ erro: 'ID do usuário não fornecido.' });

    const docFinal = cpf_cnpj || cpf || null;
    try {
        if (novaSenha && novaSenha.trim() !== '') {
            const query = `UPDATE usuarios SET nome = ?, email = ?, telefone = ?, cpf_cnpj = ?, senha_hash = ? WHERE id = ?`;
            await db.query(query, [nome, email, telefone || null, docFinal, novaSenha, id]);
        } else {
            const query = `UPDATE usuarios SET nome = ?, email = ?, telefone = ?, cpf_cnpj = ? WHERE id = ?`;
            await db.query(query, [nome, email, telefone || null, docFinal, id]);
        }
        return res.status(200).json({ mensagem: 'Perfil atualizado com sucesso!' });
    } catch (error) {
        return res.status(500).json({ erro: 'Erro interno ao salvar as alterações.' });
    }
};

app.put('/api/usuario/perfil', atualizarPerfilHandler);
app.put('/api/usuarios/perfil', atualizarPerfilHandler);

// Rota raiz
app.get('/', (req, res) => {
    res.send('Servidor GuGa Decorações rodando perfeitamente!');
});

// Inicialização
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});