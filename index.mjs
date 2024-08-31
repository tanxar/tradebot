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
    return data.message_id;
}

async function askForUsername(chatId, action, messageId) {
    await deleteMessage(chatId, messageId);
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
        const referralCode = await generateUniqueReferralCode();
        await createUser(username, text, referralCode);
        const user = await getUserByUsername(username);
        await showWelcomeMessage(chatId, user.username, user.balance, user.referral_code);
        delete userSessions[chatId];
    } else if (session.action === 'login') {
        const user = await getUserByUsername(session.username);
        if (user && user.password === text) {
            await showWelcomeMessage(chatId, user.username, user.balance, user.referral_code);
            delete userSessions[chatId];
        } else {
            await sendMessage(chatId, "Incorrect password. Please try again:");
        }
    }
}

async function showWelcomeMessage(chatId, username, balance, referralCode) {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    const message = `Welcome back, ${username}!\n\nYour balance: ${balance}\n\nReferral code: <code>${referralCode}</code>\n\nClick and hold on the code to copy.`;

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
    await showInitialOptions(chatId); // Restart the bot by showing the initial options again
}

async function addFundsToUser(chatId, username, amount) {
    const query = 'UPDATE Users SET balance = balance + $1 WHERE username = $2';
    await client.query(query, [amount, username]);
    await sendMessage(chatId, `Added ${amount} to your account.`);
}

// Function to generate a unique 6-digit referral code
async function generateUniqueReferralCode() {
    let isUnique = false;
    let referralCode;
    while (!isUnique) {
        referralCode = Math.floor(100000 + Math.random() * 900000).toString(); // Generate a 6-digit code
        const query = 'SELECT COUNT(*) FROM Users WHERE referral_code = $1';
        const result = await client.query(query, [referralCode]);
        if (result.rows[0].count == 0) {
            isUnique = true;
        }
    }
    return referralCode;
}

async function createUser(username, password, referralCode) {
    const query = 'INSERT INTO Users (username, password, balance, referral_code) VALUES ($1, $2, $3, $4)';
    await client.query(query, [username, password, 0, referralCode]);
}

async function checkUsernameExists(username) {
    const query = 'SELECT COUNT(*) FROM Users WHERE username = $1';
    const result = await client.query(query, [username]);
    return result.rows[0].count > 0;
}

async function getUserByUsername(username) {
    const query = 'SELECT * FROM Users WHERE username = $1';
    const result = await client.query(query, [username]);
    return result.rows[0];
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
            await askForUsername(chatId, data, messageId);
        } else if (data === 'logout') {
            await handleLogout(chatId, messageId);
        } else if (data === 'add_funds') {
            await handleAddFunds(chatId);
        }
    }

    if (message) {
        const chatId = message.chat.id;
        const text = message.text;

        if (userSessions[chatId]) {
            const session = userSessions[chatId];

            if (session.action === 'add_funds') {
                const amount = parseFloat(text);
                if (isNaN(amount) || amount <= 0) {
                    await sendMessage(chatId, "Please enter a valid amount.");
                } else {
                    await addFundsToUser(chatId, session.username, amount);
                    const user = await getUserByUsername(session.username);
                    await showWelcomeMessage(chatId, user.username, user.balance, user.referral_code);
                    delete userSessions[chatId];
                }
            } else if (!session.username) {
                await handleUsernameResponse(chatId, text);
            } else {
                await handlePasswordResponse(chatId, text);
            }
        } else if (text === '/start') {
            const initialMessageId = await showInitialOptions(chatId);
            userSessions[chatId] = { initialMessageId };
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
