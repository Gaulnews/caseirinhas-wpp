const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(cors());
app.use(express.json());

let sock;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[SISTEMA] Usando WhatsApp v${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        // Oculta que é um bot, simulando o Google Chrome no Windows
        browser: ['Caseirinhas TATÁ', 'Chrome', '10.0.0'],
        logger: pino({ level: 'error' }) // Mostra apenas erros reais e o QR Code
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if(qr) {
            console.log('\n==================================================');
            console.log('📸 SCANNEIE O QR CODE ABAIXO PELO SEU WHATSAPP');
            console.log('==================================================\n');
        }

        if(connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`⚠️ Conexão fechada. Motivo: ${lastDisconnect.error?.message || 'Desconhecido'}`);
            
            if(shouldReconnect) {
                console.log('🔄 Tentando reconectar em 5 segundos para evitar bloqueio...');
                setTimeout(connectToWhatsApp, 5000); // Pausa de segurança de 5 segundos
            } else {
                console.log('❌ O WhatsApp foi desconectado pelo celular. Apague a pasta auth_info_baileys e reinicie.');
            }
        } else if(connection === 'open') {
            console.log('\n✅ CONECTADO AO WHATSAPP DA TATÁ! (43 9 9982-1401)\n');
        }
    });
}

connectToWhatsApp();

app.get('/', (req, res) => res.send('🟢 WhatsApp Engine Online'));

app.post('/api/send', async (req, res) => {
    const { secret, phone, message } = req.body;
    if(secret !== process.env.API_SECRET) return res.status(401).json({error: 'Não autorizado'});
    try {
        const jid = `55${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });
        res.json({ success: true, message: 'Enviado com sucesso' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao enviar' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
