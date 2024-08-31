import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import pkg from 'pg';

const { Client } = pkg;

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

let userSessions = {};

async function showInitialOptions(chatId) {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const options = {
        chat_id: chatId,
        text: "Welcome! Please choose an option:",
        reply_markup: {
            inline_keyboard: [
                [{ text: "Create Account", callback_data: "create_account" }],
                [{ text: "Login", callback_data: "login" }],
            ],
        },
    };
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
    });
}

async function askForUsername(chatId, action) {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const text = action === 'create_account' ? "Please choose a username:" : "Please enter your username:";

    userSessions[chatId] = { action }; // Save the current action in the session

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
}

async function askForPassword(chatId) {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const text = "Please enter your password:";

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
}

async function handleUsernameResponse(chatId, text) {
    const session = userSessions[chatId];

    if (session.action === 'create_account') {
        const usernameExists = await checkUsernameExists(text);
        if (usernameExists) {
            await sendMessage(chatId, "Username taken, please choose another:");
        } else {
            userSessions[chatId].username = text;
            await askForPassword(chatId);
        }
    } else if (session.action === 'login') {
        const user = await getUserByUsername(text);
        if (user) {
            userSessions[chatId].username = text;
            await askForPassword(chatId);
        } else {
            await sendMessage(chatId, "Username not found. Please enter a valid username:");
        }
    }
}

async function handlePasswordResponse(chatId, text) {
    const session = userSessions[chatId];

    if (session.action === 'create_account') {
        const username = session.username;
        await createUser(username, text);
        await sendMessage(chatId, `Account created successfully! Welcome, ${username}.`);
        delete userSessions[chatId];
    } else if (session.action === 'login') {
        const user = await getUserByUsername(session.username);
        if (user && user.password === text) {
            await showWelcomeMessage(chatId, user.username, user.balance);
            delete userSessions[chatId];
        } else {
            await sendMessage(chatId, "Incorrect password. Please try again:");
        }
    }
}

async function showWelcomeMessage(chatId, username, balance) {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const message = `Welcome back, ${username}!\n\nYour balance: ${balance}`;

    const options = {
        chat_id: chatId,
        text: message,
        reply_markup: {
            inline_keyboard: [
                [{ text: "Logout", callback_data: "logout" }],
            ],
        },
    };

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
    });
}

// Handling incoming updates (messages and callbacks)
app.post('/webhook', async (req, res) => {
    const message = req.body.message;
    const callbackQuery = req.body.callback_query;

    if (callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;

        if (data === 'create_account' || data === 'login') {
            await askForUsername(chatId, data);
        } else if (data === 'logout') {
            await sendMessage(chatId, "You have been logged out.");
        }
    }

    if (message) {
        const chatId = message.chat.id;
        const text = message.text;

        if (userSessions[chatId]) {
            const session = userSessions[chatId];

            if (!session.username) {
                await handleUsernameResponse(chatId, text);
            } else {
                await handlePasswordResponse(chatId, text);
            }
        } else if (text === '/start') {
            await showInitialOptions(chatId);
        }
    }

    res.sendStatus(200);
});

async function sendMessage(chatId, text) {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
}

async function checkUsernameExists(username) {
    const query = 'SELECT COUNT(*) FROM Users WHERE username = $1';
    const result = await client.query(query, [username]);
    return result.rows[0].count > 0;
}

async function createUser(username, password) {
    const query = 'INSERT INTO Users (username, password, balance) VALUES ($1, $2, $3)';
    await client.query(query, [username, password, 0]);
}

async function getUserByUsername(username) {
    const query = 'SELECT * FROM Users WHERE username = $1';
    const result = await client.query(query, [username]);
    return result.rows[0];
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
