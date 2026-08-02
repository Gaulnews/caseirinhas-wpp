const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(cors());
app.use(express.json());

let sock;
let isConnected = false;
const NUMERO_WPP = "5543999821401";

async function iniciarMotor() {
    const { state, saveCreds } = await useMultiFileAuthState('sessao_segura_tata');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    if (!sock.authState.creds.registered) {
        console.log("⏳ Aguardando sincronização com a Meta...");
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(NUMERO_WPP);
                console.log('\n======================================================');
                console.log('🚨 AÇÃO NECESSÁRIA NO SEU WHATSAPP 🚨');
                console.log(`CÓDIGO DE EMPARELHAMENTO: ${code}`);
                console.log('======================================================\n');
            } catch (err) {
                console.log('Erro ao gerar código:', err.message);
            }
        }, 5000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'close') {
            isConnected = false;
            const reason = lastDisconnect.error?.output?.statusCode;
            console.log(`⚠️ Conexão fechada. Motivo / StatusCode: ${reason}`);
            if (reason !== DisconnectReason.loggedOut) {
                setTimeout(iniciarMotor, 4000);
            } else {
                console.log('❌ Sessão desconectada pelo celular. Refaça o emparelhamento.');
            }
        } else if(connection === 'open') {
            isConnected = true;
            console.log('\n✅ CONECTADO AO WHATSAPP DA TATÁ NO RENDER! (43 9 9982-1401)\n');
        }
    });
}

iniciarMotor();

app.get('/', (req, res) => res.send(`🟢 WhatsApp Engine Online | Status Conectado: ${isConnected}`));

app.post('/api/send', async (req, res) => {
    const { secret, phone, message } = req.body;
    if(secret !== 'senha_secreta_tata_2026') return res.status(401).json({error: 'Não autorizado'});
    
    // Trava de segurança: impede o erro 428 se o WhatsApp ainda não estiver pronto
    if (!isConnected || !sock) {
        return res.status(503).json({ error: 'WhatsApp ainda não está sincronizado ou conectado no Render. Aguarde alguns segundos.' });
    }

    try {
        const cleanPhone = phone.replace(/\D/g, '');
        const jid = `${cleanPhone}@s.whatsapp.net`;
        
        await sock.sendMessage(jid, { text: message });
        res.json({ success: true, message: 'Disparo efetuado com sucesso pelo Render.' });
    } catch (error) {
        console.error('Erro detalhado no envio Baileys:', error);
        res.status(500).json({ error: 'Falha ao enviar mensagem.', details: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`⚙️  Servidor Render rodando na porta ${PORT}...`));
