const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Rota de Login (Cliente e ADM)
router.post('/login', async (req, res) => {
    const email = req.body.email?.trim().toLowerCase();
    const senha = req.body.senha?.trim();

    // Validação de entrada
    if (!email || !senha) {
        return res.status(400).json({ erro: 'Informe e-mail e senha para prosseguir.' });
    }

    try {
        const query = 'SELECT * FROM usuarios WHERE email = ?';
        const [usuarios] = await db.query(query, [email]);

        if (usuarios.length === 0) {
            return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
        }

        const usuario = usuarios[0];
        const senhaArmazenada = usuario.senha_hash || usuario.senha;

        if (senhaArmazenada !== senha) {
            return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
        }

        // Verifica de forma flexível se é Administrador
        const valTipo = (usuario.tipo_usuario || usuario.tipo || usuario.role || '').toString().toLowerCase().trim();
        const eAdmin = (
            valTipo === 'admin' || 
            valTipo === 'adm' || 
            valTipo === 'administrador' || 
            usuario.is_admin === true || 
            usuario.is_admin === 1 || 
            email.includes('admin')
        );

        const tipoFinal = eAdmin ? 'admin' : 'cliente';

        // Retorna o objeto padronizado com os privilégios corretos
        res.json({
            mensagem: 'Login realizado com sucesso',
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
                telefone: usuario.telefone || '',
                cpf: usuario.cpf_cnpj || '',
                cpf_cnpj: usuario.cpf_cnpj || '',
                tipo_usuario: tipoFinal,
                is_admin: eAdmin
            }
        });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao realizar login', detalhe: error.message });
    }
});

// Rota de Cadastro de Cliente
router.post('/cadastro', async (req, res) => {
    const { nome, senha, documento, cpf, cpf_cnpj, telefone } = req.body;
    const email = req.body.email?.trim().toLowerCase();
    
    const docFinal = cpf || cpf_cnpj || documento || null;

    if (!nome || !email || !senha) {
        return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
    }

    try {
        const [existente] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (existente.length > 0) {
            return res.status(400).json({ erro: 'E-mail já cadastrado' });
        }

        let tipoFinal = email.includes('admin') ? 'admin' : 'cliente';

        const insertQuery = `
            INSERT INTO usuarios 
            (nome, email, senha_hash, telefone, cpf_cnpj, tipo_usuario) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(insertQuery, [nome, email, senha, telefone || null, docFinal, tipoFinal]);

        res.status(201).json({
            mensagem: 'Usuário cadastrado com sucesso',
            usuario: {
                id: result.insertId,
                nome,
                email,
                telefone: telefone || '',
                cpf: docFinal || '',
                cpf_cnpj: docFinal || '',
                tipo_usuario: tipoFinal,
                is_admin: tipoFinal === 'admin'
            }
        });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao cadastrar usuário', detalhe: error.message });
    }
});

module.exports = router;