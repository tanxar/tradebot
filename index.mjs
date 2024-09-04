import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import pkg from 'pg';
import * as solanaWeb3 from '@solana/web3.js'; // Solana SDK for wallet generation

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

// Set up the webhook for Telegram bot
fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook?url=${WEBHOOK_URL}`)
    .then(res => res.json())
    .then(json => console.log(json))
    .catch(err => console.error('Error setting webhook:', err));

let userSessions = {};

// Solana USDT Mint Address
const usdtMintAddress = 'Es9vMFrzdQvAx2eWtS5tybVopF3WQihDnm1HmwW8VaMF';

// Function to generate a Solana wallet
async function generateSolanaWallet() {
    const keypair = solanaWeb3.Keypair.generate(); // Generates a new keypair
    const publicKey = keypair.publicKey.toString();
    const privateKey = Buffer.from(keypair.secretKey).toString('base64'); // Save the private key securely
    return { publicKey, privateKey };
}

// Save the generated wallet in the database
async function saveUserWallet(telegramId, publicKey, privateKey) {
    const query = 'UPDATE users SET sol_wallet_address = $1, sol_wallet_private_key = $2 WHERE telegram_id = $3';
    await client.query(query, [publicKey, privateKey, telegramId]);
}

// Monitor USDT transactions to the generated wallet address
async function monitorUSDTTransactions(walletAddress, telegramId) {
    const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('mainnet-beta'));

    const latestSignature = await connection.getConfirmedSignaturesForAddress2(
        new solanaWeb3.PublicKey(walletAddress),
        { limit: 1 }
    );

    if (latestSignature.length > 0) {
        const transaction = await connection.getParsedConfirmedTransaction(latestSignature[0].signature);
        const tokenTransfers = transaction.meta?.postTokenBalances || [];

        tokenTransfers.forEach(transfer => {
            if (transfer.mint === usdtMintAddress) {
                const amount = transfer.uiTokenAmount.uiAmount;
                console.log(`USDT received: ${amount}`);
                updateUserBalance(telegramId, amount);
            }
        });
    }
}

// Update user balance in the database
async function updateUserBalance(telegramId, amount) {
    const query = 'UPDATE users SET balance = balance + $1 WHERE telegram_id = $2';
    await client.query(query, [amount, telegramId]);
}

// Handle "Add Funds" when a user clicks the button
async function handleAddFunds(chatId, telegramId) {
    const wallet = await generateSolanaWallet(); // Generate a unique wallet
    await saveUserWallet(telegramId, wallet.publicKey, wallet.privateKey);

    await sendMessage(chatId, `Please send USDT to your Solana wallet address:\n<code>${wallet.publicKey}</code>`, 'HTML');

    // You can monitor the wallet for incoming USDT transactions periodically
    setInterval(async () => {
        await monitorUSDTTransactions(wallet.publicKey, telegramId);
    }, 60000); // Check every minute for incoming transactions
}

// Show the user's updated balance after receiving USDT
async function showUpdatedBalance(chatId, telegramId) {
    const user = await getUserByTelegramId(telegramId);
    const balance = user.balance;
    await sendMessage(chatId, `Your updated balance: ${balance} USDT`);
}

// Function to send a message via Telegram
async function sendMessage(chatId, text, parseMode = 'Markdown') {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
    });
}

// Show initial options to the user (Create Account, Login)
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

// Get user data by Telegram ID
async function getUserByTelegramId(telegramId) {
    const query = 'SELECT * FROM users WHERE telegram_id = $1';
    const result = await client.query(query, [telegramId]);
    return result.rows[0];
}

// Create a new user with a generated Solana address
async function createUser(telegramId, password, referralCode) {
    const query = 'INSERT INTO users (telegram_id, password, balance, ref_code_invite_others) VALUES ($1, $2, $3, $4)';
    await client.query(query, [telegramId, password, 0, referralCode]);
}

// Check if user exists in the database
async function checkUserExists(telegramId) {
    const query = 'SELECT COUNT(*) FROM users WHERE telegram_id = $1';
    const result = await client.query(query, [telegramId]);
    return result.rows[0].count > 0;
}

// Generate a unique referral code
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
        } else if (data === 'add_funds') {
            await handleAddFunds(chatId, userId);
        }
    }

    if (message) {
        const chatId = message.chat.id;
        const userId = message.from.id;
        const firstName = message.from.first_name;
        const text = message.text;

        if (text === '/start') {
            await showInitialOptions(chatId, userId, firstName);
        }
    }

    res.sendStatus(200);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
