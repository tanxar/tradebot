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

async function showInitialOptions(chatId, userId, firstName) {
    const userExists = await checkUserExists(userId);
    let options;

    if (userExists) {
        const message = `Welcome back, ${firstName}!\n\nTelegram ID: ${userId}`;
        options = {
            chat_id: chatId,
            text: message,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Login", callback_data: "login" }],
                ],
            },
        };
    } else {
        const message = "Welcome! Please choose an option:";
        options = {
            chat_id: chatId,
            text: message,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Create Account", callback_data: "create_account" }],
                ],
            },
        };
    }

    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
    });
}

async function askForPassword(chatId, userId, action) {
    const message = action === 'create_account' 
        ? "Choose a password to create your account:" 
        : "Please enter your password to login:";
    
    userSessions[chatId] = { action, userId }; // Save the userId and action in the session

    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: message,
        }),
    });
}

async function handlePasswordResponse(chatId, text) {
    const session = userSessions[chatId];

    if (session.action === 'create_account') {
        const userId = session.userId;
        const referralCode = await generateUniqueReferralCode();
        await createUser(userId, text, referralCode);
        const user = await getUserByTelegramId(userId);
        console.log('Referral code during account creation:', user.ref_code_invite_others); // Debugging line
        await showWelcomeMessage(chatId, userId, user.balance, user.ref_code_invite_others); // Pass referral code here
        delete userSessions[chatId];
    } else if (session.action === 'login') {
        const user = await getUserByTelegramId(session.userId);
        console.log('Referral code during login:', user.ref_code_invite_others); // Debugging line
        if (user && user.password === text) {
            await showWelcomeMessage(chatId, session.userId, user.balance, user.ref_code_invite_others); // Pass referral code here
            delete userSessions[chatId];
        } else {
            await sendMessage(chatId, "Incorrect password. Please try again:");
        }
    }
}

async function showWelcomeMessage(chatId, userId, balance, referralCode) {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const message = `Welcome back!\n\nYour balance: ${balance} USDT\n\nReferral code: <code>${referralCode}</code> (click to copy)`;

    const options = {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML', // Enable HTML mode to format the referral code
        reply_markup: {
            inline_keyboard: [
                [{ text: "Add Funds", callback_data: "add_funds" }],
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

async function handleAddFunds(chatId) {
    await sendMessage(chatId, "Please enter the amount you would like to add:");
    userSessions[chatId] = { action: 'add_funds' };
}

async function handleLogout(chatId, messageId) {
    await deleteMessage(chatId, messageId);
    await sendMessage(chatId, "You have been logged out.");
    const { userId, firstName } = userSessions[chatId];
    await showInitialOptions(chatId, userId, firstName);
}

async function addFundsToUser(chatId, userId, amount) {
    const query = 'UPDATE users SET balance = balance + $1 WHERE telegram_id = $2';
    await client.query(query, [amount, userId]);
    await sendMessage(chatId, `Added ${amount} to your account.`);
}

// Function to generate a unique 6-digit referral code
async function generateUniqueReferralCode() {
    let isUnique = false;
    let referralCode;
    while (!isUnique) {
        referralCode = Math.floor(100000 + Math.random() * 900000).toString(); // Generate a 6-digit code
        const query = 'SELECT COUNT(*) FROM users WHERE ref_code_invite_others = $1';
        const result = await client.query(query, [referralCode]);
        if (result.rows[0].count == 0) {
            isUnique = true;
        }
    }
    return referralCode;
}

async function createUser(telegramId, password, referralCode) {
    const query = 'INSERT INTO users (telegram_id, password, balance, ref_code_invite_others) VALUES ($1, $2, $3, $4)';
    await client.query(query, [telegramId, password, 0, referralCode]);
}

async function checkUserExists(telegramId) {
    const query = 'SELECT COUNT(*) FROM users WHERE telegram_id = $1';
    const result = await client.query(query, [telegramId]);
    return result.rows[0].count > 0;
}

async function getUserByTelegramId(telegramId) {
    const query = 'SELECT * FROM users WHERE telegram_id = $1';
    const result = await client.query(query, [telegramId]);
    return result.rows[0];
}

// Handling incoming updates (messages and callbacks)
app.post('/webhook', async (req, res) => {
    const message = req.body.message;
    const callbackQuery = req.body.callback_query;

    if (callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;
        const userId = callbackQuery.from.id;
        const firstName = callbackQuery.from.first_name;
        const data = callbackQuery.data;

        userSessions[chatId] = { userId, firstName };

        if (data === 'create_account') {
            await askForPassword(chatId, userId, data);
        } else if (data === 'login') {
            await askForPassword(chatId, userId, data);
        } else if (data === 'logout') {
            await handleLogout(chatId, messageId);
        } else if (data === 'add_funds') {
            await handleAddFunds(chatId);
        }
    }

    if (message) {
        const chatId = message.chat.id;
        const userId = message.from.id;
        const firstName = message.from.first_name;
        const text = message.text;

        if (userSessions[chatId]) {
            const session = userSessions[chatId];

            if (session.action === 'add_funds') {
                const amount = parseFloat(text);
                if (isNaN(amount) || amount <= 0) {
                    await sendMessage(chatId, "Please enter a valid amount.");
                } else {
                    await addFundsToUser(chatId, session.userId, amount);
                    const user = await getUserByTelegramId(session.userId);
                    await showWelcomeMessage(chatId, session.userId, user.balance, user.ref_code_invite_others);
                    delete userSessions[chatId];
                }
            } else if (session.action === 'create_account' || session.action === 'login') {
                await handlePasswordResponse(chatId, text);
            }
        } else if (text === '/start') {
            await showInitialOptions(chatId, userId, firstName);
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

async function deleteMessage(chatId, messageId) {
    const url = `https://api.telegram.org/bot${TOKEN}/deleteMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
