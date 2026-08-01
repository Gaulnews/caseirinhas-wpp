const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(cors());
app.use(express.json());

let sock;
const NUMERO_WPP = "5543999821401";

async function iniciarMotor() {
    const { state, saveCreds } = await useMultiFileAuthState('sessao_segura_tata');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // DESATIVA O QR CODE!
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
            const reason = lastDisconnect.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                setTimeout(iniciarMotor, 4000);
            } else {
                console.log('❌ Sessão desconectada pelo celular.');
            }
        } else if(connection === 'open') {
            console.log('\n✅ CONECTADO AO WHATSAPP DA TATÁ NO RENDER! (43 9 9982-1401)\n');
        }
    });
}

iniciarMotor();

app.get('/', (req, res) => res.send('🟢 WhatsApp Engine Online'));

app.post('/api/send', async (req, res) => {
    const { secret, phone, message } = req.body;
    // Valida a senha da Vercel
    if(secret !== 'senha_secreta_tata_2026') return res.status(401).json({error: 'Não autorizado'});
    
    try {
        const jid = `55${phone.replace(/\D/g, '')}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });
        res.json({ success: true, message: 'Disparo efetuado com sucesso pelo Render.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao enviar.' });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`⚙️  Servidor Render rodando na porta ${PORT}...`));
