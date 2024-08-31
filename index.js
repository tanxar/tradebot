const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const { Client } = require('pg');

// Create Express app
const app = express();
app.use(bodyParser.json());

// PostgreSQL client setup
const client = new Client({
    connectionString: 'postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3',
});
client.connect();

// Telegram bot API token and webhook URL
const TOKEN = '7403620437:AAHUzMiWQt_AHAZ-PwYY0spVfcCKpWFKQoE';
const WEBHOOK_URL = 'https://dedouleveitipota.onrender.com/webhook';

// Set up the webhook
fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook?url=${WEBHOOK_URL}`)
    .then(res => res.json())
    .then(json => console.log(json))
    .catch(err => console.error('Error setting webhook:', err));

// Handle incoming messages
app.post('/webhook', async (req, res) => {
    const message = req.body.message;

    if (!message || !message.text) {
        return res.sendStatus(200);
    }

    const chatId = message.chat.id;
    const text = message.text.trim().split(' ');

    if (text[0] === '/register' && text.length === 3) {
        const username = text[1];
        const password = text[2];

        try {
            const query = 'INSERT INTO Users (username, password) VALUES ($1, $2)';
            await client.query(query, [username, password]);

            const responseText = `User ${username} registered successfully!`;
            await sendMessage(chatId, responseText);
        } catch (err) {
            console.error('Error inserting into database:', err);
            await sendMessage(chatId, 'An error occurred while registering the user.');
        }
    } else {
        await sendMessage(chatId, 'Please use the format /register <username> <password>');
    }

    res.sendStatus(200);
});

// Function to send a message
async function sendMessage(chatId, text) {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
