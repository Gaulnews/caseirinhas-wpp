const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(cors());
app.use(express.json());

let sock;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }) // Mantém os logs limpos no Render
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('⚠️ Conexão fechada. Reconectando:', shouldReconnect);
            if(shouldReconnect) connectToWhatsApp();
        } else if(connection === 'open') {
            console.log('✅ CONECTADO AO WHATSAPP DA TATÁ! (43 9 9982-1401)');
        }
    });
}

connectToWhatsApp();

// Rota de Saúde (Para manter o Render acordado 24h)
app.get('/', (req, res) => res.send('🟢 WhatsApp Engine Online'));

// Rota de Disparo (Recebe o comando do Vercel)
app.post('/api/send', async (req, res) => {
    const { secret, phone, message } = req.body;
    
    if(secret !== process.env.API_SECRET) {
        return res.status(401).json({error: 'Não autorizado'});
    }

    try {
        // Formata o número para o padrão do WhatsApp (55 + DDD + Numero)
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
