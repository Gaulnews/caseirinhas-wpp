const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

let sock;
let isConnected = false;
let ultimasRespostas = [];
const NUMERO_WPP = "5543999821401";
const SESSION_DIR = 'sessao_segura_tata';

async function iniciarMotor() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Chrome (Windows)', 'Chrome', '120.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                console.log("⏳ Estabelecendo canal seguro com a Meta...");
                const code = await sock.requestPairingCode(NUMERO_WPP);
                const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log('\n======================================================');
                console.log('🚨 AÇÃO NECESSÁRIA NO SEU WHATSAPP 🚨');
                console.log(`CÓDIGO DE EMPARELHAMENTO: ${formattedCode}`);
                console.log('======================================================\n');
            } catch (err) {
                console.log('Erro ao gerar código de emparelhamento:', err.message);
            }
        }, 8000); // Aguarda 8 segundos para estabilizar a conexão antes de pedir o código
    }

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.key.fromMe && msg.message) {
            const remetente = msg.key.remoteJid;
            const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || '[Mídia/Outro]';
            
            ultimasRespostas.unshift({
                telefone: remetente.replace('@s.whatsapp.net', ''),
                mensagem: texto,
                horario: new Date().toLocaleTimeString()
            });
            if (ultimasRespostas.length > 50) ultimasRespostas.pop();
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'close') {
            isConnected = false;
            const reason = lastDisconnect.error?.output?.statusCode;
            console.log(`⚠️ Conexão fechada. Motivo / StatusCode: ${reason}`);
            
            // Se houver logout ou erro crítico de sessão, limpa a pasta para forçar novo emparelhamento limpo
            if (reason === DisconnectReason.loggedOut || reason === 428 || reason === 401) {
                console.log('🧹 Limpando sessão corrompida...');
                try {
                    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                } catch(e) {}
            }
            setTimeout(iniciarMotor, 5000);
        } else if(connection === 'open') {
            isConnected = true;
            console.log('\n✅ CONECTADO AO WHATSAPP DA TATÁ NO RENDER! (43 9 9982-1401)\n');
        }
    });
}

iniciarMotor();

app.get('/', (req, res) => res.send(`🟢 Engine Ativa | Conectado: ${isConnected}`));

app.get('/api/responses', (req, res) => {
    res.json({ success: true, respostas: ultimasRespostas });
});

app.post('/api/send', async (req, res) => {
    const { secret, phone, message } = req.body;
    if(secret !== 'senha_secreta_tata_2026') return res.status(401).json({error: 'Não autorizado'});
    
    if (!isConnected || !sock) {
        return res.status(503).json({ error: 'WhatsApp reconectando. Tente em instantes.' });
    }

    try {
        const cleanPhone = phone.replace(/\D/g, '');
        const jid = `${cleanPhone}@s.whatsapp.net`;
        
        await sock.sendMessage(jid, { text: message });
        res.json({ success: true, message: 'Disparo efetuado.' });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao enviar.', details: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`⚙️ Servidor na porta ${PORT}`));
