const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
app.use(cors());
app.use(express.json());

let sock;
let isConnected = false;
let ultimasRespostas = []; // Armazena as últimas interações dos clientes
const NUMERO_WPP = "5543999821401";

async function iniciarMotor() {
    const { state, saveCreds } = await useMultiFileAuthState('sessao_segura_tata');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Caseirinhas Engine', 'Chrome', '120.0.0']
    });

    if (!sock.authState.creds.registered) {
        console.log("⏳ Aguardando sincronização com a Meta...");
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(NUMERO_WPP);
                console.log(`\nCÓDIGO DE EMPARELHAMENTO: ${code}\n`);
            } catch (err) {
                console.log('Erro ao gerar código:', err.message);
            }
        }, 5000);
    }

    sock.ev.on('creds.update', saveCreds);

    // Captura mensagens recebidas (Respostas dos Leads)
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.key.fromMe && msg.message) {
            const remetente = msg.key.remoteJid;
            const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || '[Mídia/Outro]';
            
            console.log(`📩 Resposta recebida de ${remetente}: ${texto}`);
            
            // Salva no histórico em memória recente (ou banco de dados)
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
            if (reason !== DisconnectReason.loggedOut) {
                setTimeout(iniciarMotor, 4000);
            }
        } else if(connection === 'open') {
            isConnected = true;
            console.log('\n✅ MOTOR DE RASTREIO E DISPARO CONECTADO!\n');
        }
    });
}

iniciarMotor();

app.get('/', (req, res) => res.send(`🟢 Engine Ativa | Conectado: ${isConnected}`));

// Rota para o painel consultar as respostas recebidas em tempo real
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
