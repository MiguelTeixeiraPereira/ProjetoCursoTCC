const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Rota de Login (Cliente e ADM)
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    // Validação de entrada
    if (!email || !senha) {
        return res.status(400).json({ erro: 'Informe e-mail e senha para prosseguir.' });
    }

    try {
        const query = 'SELECT id, nome, email, telefone, cpf_cnpj, tipo_usuario FROM usuarios WHERE email = ? AND senha_hash = ?';
        const [usuarios] = await db.query(query, [email, senha]);

        if (usuarios.length === 0) {
            return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
        }

        const usuario = usuarios[0];

        // Retorna o objeto padronizado com 'cpf' para preencher a tela de perfil
        res.json({
            mensagem: 'Login realizado com sucesso',
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
                telefone: usuario.telefone || '',
                cpf: usuario.cpf_cnpj || '',
                cpf_cnpj: usuario.cpf_cnpj || '',
                tipo_usuario: usuario.tipo_usuario
            }
        });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao realizar login', detalhe: error.message });
    }
});

// Rota de Cadastro de Cliente
router.post('/cadastro', async (req, res) => {
    const { nome, email, senha, documento, cpf, cpf_cnpj, telefone } = req.body;
    
    // Suporta o envio do campo vindo como 'documento', 'cpf' ou 'cpf_cnpj' do front-end
    const docFinal = cpf || cpf_cnpj || documento || null;

    // Validação de campos obrigatórios
    if (!nome || !email || !senha) {
        return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
    }

    try {
        const [existente] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (existente.length > 0) {
            return res.status(400).json({ erro: 'E-mail já cadastrado' });
        }

        const insertQuery = `
            INSERT INTO usuarios 
            (nome, email, senha_hash, telefone, cpf_cnpj, tipo_usuario) 
            VALUES (?, ?, ?, ?, ?, 'cliente')
        `;
        const [result] = await db.query(insertQuery, [nome, email, senha, telefone || null, docFinal]);

        res.status(201).json({
            mensagem: 'Usuário cadastrado com sucesso',
            usuario: {
                id: result.insertId,
                nome,
                email,
                telefone: telefone || '',
                cpf: docFinal || '',
                cpf_cnpj: docFinal || '',
                tipo_usuario: 'cliente'
            }
        });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao cadastrar usuário', detalhe: error.message });
    }
});

module.exports = router;