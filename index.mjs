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
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
    });
    const data = await response.json();
    userSessions[chatId] = { lastBotMessageId: data.message_id };
}

async function askForUsername(chatId, messageId, action) {
    await deleteMessages(chatId, messageId);
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const text = action === 'create_account' ? "Please choose a username:" : "Please enter your username:";

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
    const data = await response.json();
    userSessions[chatId] = { action, lastBotMessageId: data.message_id };
}

async function askForPassword(chatId, messageId) {
    await deleteMessages(chatId, messageId);
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const text = "Please enter your password:";

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
    const data = await response.json();
    userSessions[chatId].lastBotMessageId = data.message_id;
}

async function handleUsernameResponse(chatId, messageId, text) {
    await deleteMessages(chatId, messageId);
    const session = userSessions[chatId];

    if (session.action === 'create_account') {
        const usernameExists = await checkUsernameExists(text);
        if (usernameExists) {
            const botMessage = await sendMessage(chatId, "Username taken, please choose another:");
            userSessions[chatId].lastBotMessageId = botMessage.message_id;
        } else {
            userSessions[chatId].username = text;
            await askForPassword(chatId, null);
        }
    } else if (session.action === 'login') {
        const user = await getUserByUsername(text);
        if (user) {
            userSessions[chatId].username = text;
            await askForPassword(chatId, null);
        } else {
            const botMessage = await sendMessage(chatId, "Username not found. Please enter a valid username:");
            userSessions[chatId].lastBotMessageId = botMessage.message_id;
        }
    }
}

async function handlePasswordResponse(chatId, messageId, text) {
    await deleteMessages(chatId, messageId);
    const session = userSessions[chatId];

    if (session.action === 'create_account') {
        const username = session.username;
        await createUser(username, text);
        const user = await getUserByUsername(username);
        await showWelcomeMessage(chatId, user.username, user.balance);
        delete userSessions[chatId];
    } else if (session.action === 'login') {
        const user = await getUserByUsername(session.username);
        if (user && user.password === text) {
            await showWelcomeMessage(chatId, user.username, user.balance);
            delete userSessions[chatId];
        } else {
            const botMessage = await sendMessage(chatId, "Incorrect password. Please try again:");
            userSessions[chatId].lastBotMessageId = botMessage.message_id;
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
                [{ text: "Add Funds", callback_data: "add_funds" }],
                [{ text: "Logout", callback_data: "logout" }],
            ],
        },
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
    });
    const data = await response.json();
    userSessions[chatId].lastBotMessageId = data.message_id;
}

async function handleAddFunds(chatId, messageId) {
    await deleteMessages(chatId, messageId);
    const botMessage = await sendMessage(chatId, "Please enter the amount you would like to add:");
    userSessions[chatId].lastBotMessageId = botMessage.message_id;
    userSessions[chatId].action = 'add_funds';
}

async function addFundsToUser(chatId, messageId, username, amount) {
    const query = 'UPDATE Users SET balance = balance + $1 WHERE username = $2';
    await client.query(query, [amount, username]);
    const botMessage = await sendMessage(chatId, `Added ${amount} to your account.`);
    userSessions[chatId].lastBotMessageId = botMessage.message_id;
}

// Handling incoming updates (messages and callbacks)
app.post('/webhook', async (req, res) => {
    const message = req.body.message;
    const callbackQuery = req.body.callback_query;

    if (callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;
        const data = callbackQuery.data;

        if (data === 'create_account' || data === 'login') {
            await askForUsername(chatId, messageId, data);
        } else if (data === 'logout') {
            await deleteMessages(chatId, messageId);
            await sendMessage(chatId, "You have been logged out.");
        } else if (data === 'add_funds') {
            await handleAddFunds(chatId, messageId);
        }
    }

    if (message) {
        const chatId = message.chat.id;
        const messageId = message.message_id;
        const text = message.text;

        if (userSessions[chatId]) {
            const session = userSessions[chatId];

            if (session.action === 'add_funds') {
                const amount = parseFloat(text);
                if (isNaN(amount) || amount <= 0) {
                    const botMessage = await sendMessage(chatId, "Please enter a valid amount.");
                    userSessions[chatId].lastBotMessageId = botMessage.message_id;
                } else {
                    await addFundsToUser(chatId, messageId, session.username, amount);
                    const user = await getUserByUsername(session.username);
                    await showWelcomeMessage(chatId, user.username, user.balance);
                    delete userSessions[chatId];
                }
            } else if (!session.username) {
                await handleUsernameResponse(chatId, messageId, text);
            } else {
                await handlePasswordResponse(chatId, messageId, text);
            }
        } else if (text === '/start') {
            await showInitialOptions(chatId);
        }
    }

    res.sendStatus(200);
});

async function sendMessage(chatId, text) {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
    return response.json(); // Return message details, including message_id
}

async function deleteMessages(chatId, messageId) {
    if (messageId) {
        const url = `https://api.telegram.org/bot${TOKEN}/deleteMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
        });
    }
    const lastBotMessageId = userSessions[chatId]?.lastBotMessageId;
    if (lastBotMessageId) {
        await fetch(`https://api.telegram.org/bot${TOKEN}/deleteMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: lastBotMessageId }),
        });
    }
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
