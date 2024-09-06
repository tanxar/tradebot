import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import pkg from 'pg';
import * as solanaWeb3 from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, transfer } from '@solana/spl-token';
import bs58 from 'bs58'; // For decoding base58 private keys

const { Client } = pkg;

// Initialize the Express app
const app = express();
app.use(bodyParser.json()); // Ensure body-parser is set to parse JSON requests

// Object to hold user sessions
let userSessions = {};


// PostgreSQL client setup
const client = new Client({
    connectionString: 'postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3',
});
client.connect()
    .then(() => console.log("Connected to PostgreSQL successfully"))
    .catch(err => console.error("Error connecting to PostgreSQL:", err));

// Telegram bot API token and webhook URL
const TOKEN = '7403620437:AAHUzMiWQt_AHAZ-PwYY0spVfcCKpWFKQoE';
const WEBHOOK_URL = 'https://dedouleveitipota.onrender.com/webhook';

// Set up the webhook for Telegram bot
fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook?url=${WEBHOOK_URL}`)
    .then(res => res.json())
    .then(json => console.log(json))
    .catch(err => console.error('Error setting webhook:', err));

// USDT Mint Address on Solana
const usdtMintAddress = new solanaWeb3.PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');

// Phantom wallet address (where USDT will be transferred)
const phantomWalletAddress = 'G2XNkLGnHeFTCj5Eb328t49aV2xL3rYmrwugg4n3BPHm'; // Replace with your actual Phantom wallet address

// Function to monitor USDT transactions and update balance
async function monitorUSDTTransactions(walletAddress, userId) {
    try {
        console.log(`Monitoring wallet ${walletAddress} for USDT balance updates`);

        // Fetch the current USDT balance (Assumed via Solscan or another source)
        const usdtBalance = await getUSDTBalance(walletAddress);

        if (usdtBalance > 0) {
            const lastSignature = await getLastTransactionSignature(userId);

            console.log(`USDT balance detected: ${usdtBalance}`);

            await client.query('BEGIN'); // Begin transaction

            await saveTransactionToDatabase(userId, walletAddress, usdtBalance, lastSignature);
            await updateUserBalance(userId, usdtBalance);

            const amountToTransfer = Math.floor(usdtBalance * 10 ** 6); // Convert to smallest unit (Lamports for USDT)
            await transferUSDTToPhantomWallet(walletAddress, amountToTransfer);

            await updateLastTransactionSignature(userId, lastSignature);
            await client.query('COMMIT'); // Commit transaction

            console.log(`Balance updated and transferred to Phantom wallet for user ${userId}`);
        } else {
            console.log(`No USDT balance detected for wallet ${walletAddress}`);
        }
    } catch (error) {
        console.error(`Error monitoring USDT transactions: ${error.message}`);
        await client.query('ROLLBACK');
    }
}

// Function to transfer USDT to Phantom Wallet
async function transferUSDTToPhantomWallet(walletAddress, amount) {
    const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');
    const usdtMintPublicKey = new solanaWeb3.PublicKey(usdtMintAddress);

    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        walletAddress,  // Provide wallet's public key
        usdtMintPublicKey,
        walletAddress // Same public key here
    );

    const toTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        walletAddress,  // Provide keypair
        usdtMintPublicKey,
        new solanaWeb3.PublicKey(phantomWalletAddress) // Phantom wallet public key
    );

    if (amount > 0) {
        const signature = await transfer(
            connection,
            walletAddress,
            fromTokenAccount.address,
            toTokenAccount.address,
            walletAddress,
            amount
        );

        console.log(`USDT transferred to Phantom wallet. Transaction signature: ${signature}`);
    } else {
        console.log("Transfer amount is zero or invalid.");
    }
}

// Update the last known transaction signature for the user
async function updateLastTransactionSignature(userId, signature) {
    const query = `UPDATE users SET last_transaction_signature = $1 WHERE id = $2`;
    await client.query(query, [signature, userId]);
}

// Save USDT transaction details to the database
async function saveTransactionToDatabase(userId, walletAddress, amount, signature) {
    try {
        const query = `INSERT INTO usdt_transactions (user_id, wallet_address, amount, signature) VALUES ($1, $2, $3, $4)`;
        await client.query(query, [userId, walletAddress, amount, signature]);
        console.log(`Transaction saved in the database with signature: ${signature}`);
    } catch (error) {
        console.error('Error saving transaction to the database:', error.message);
    }
}

// Update user balance in the database
async function updateUserBalance(userId, amount) {
    try {
        const query = `UPDATE users SET balance = balance + $1 WHERE id = $2`;
        await client.query(query, [amount, userId]);
        console.log(`User's balance updated by ${amount} USDT.`);
    } catch (error) {
        console.error('Error updating user balance:', error.message);
    }
}

// Function to get the last transaction signature for a user
async function getLastTransactionSignature(userId) {
    const query = `SELECT last_transaction_signature FROM users WHERE id = $1`;
    const result = await client.query(query, [userId]);

    if (result.rows.length > 0) {
        return result.rows[0].last_transaction_signature;
    }

    return null;
}

// Handle incoming updates (messages and callbacks)
app.post('/webhook', async (req, res) => {
    console.log("Incoming webhook:", req.body);

    const message = req.body.message;
    const callbackQuery = req.body.callback_query;

    if (callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;

        if (data === 'create_account') {
            console.log(`Create account clicked by user ${userId}`);
            await askForPassword(chatId, userId, 'create_account');
        } else if (data === 'login') {
            console.log(`Login button clicked by user ${userId}`);
            await askForPassword(chatId, userId, 'login');
        } else if (data === 'add_funds') {
            console.log(`Add Funds button clicked by user ${userId}`);
            await handleAddFunds(chatId, userId);
        }
    }

    if (message) {
        const chatId = message.chat.id;
        const userId = message.from.id;
        const text = message.text;

        if (text === '/start') {
            const firstName = message.from.first_name;
            await showInitialOptions(chatId, userId, firstName);
        } else if (userSessions[chatId] && (userSessions[chatId].action === 'create_account' || userSessions[chatId].action === 'login')) {
            await handlePasswordResponse(chatId, text);
        }
    }

    res.sendStatus(200);
});

// Show initial options to the user (Create Account and Login buttons)
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

    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
    });
}

// Check if user exists in the database by Telegram ID
async function checkUserExists(telegramId) {
    const query = 'SELECT COUNT(*) FROM users WHERE telegram_id = $1';
    const result = await client.query(query, [telegramId]);
    return result.rows[0].count > 0;
}

// Function to ask the user for a password (during account creation or login)
async function askForPassword(chatId, userId, action) {
    const message = action === 'create_account'
        ? "Please choose a password to create your account:"
        : "Please enter your password to log in:";

    userSessions[chatId] = { action, userId };

    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: message,
        }),
    });
}

// Handle password response from the user (during account creation or login)
async function handlePasswordResponse(chatId, text) {
    const session = userSessions[chatId];

    if (!session) {
        await sendMessage(chatId, "Something went wrong. Please try again.");
        return;
    }

    const { action, userId } = session;

    if (action === 'create_account') {
        const referralCode = await generateUniqueReferralCode();
        await createUser(userId, text, referralCode);
        const user = await getUserByTelegramId(userId);
        await showWelcomeMessage(chatId, userId, user.balance, user.ref_code_invite_others);
        delete userSessions[chatId];
    } else if (action === 'login') {
        const user = await getUserByTelegramId(userId);
        if (user && user.password === text) {
            await showWelcomeMessage(chatId, userId, user.balance, user.ref_code_invite_others);
            delete userSessions[chatId];
        } else {
            await sendMessage(chatId, "Incorrect password. Please try again.");
        }
    }
}

// Create a new user in the database
async function createUser(telegramId, password, referralCode) {
    const keypair = solanaWeb3.Keypair.generate();
    const solWalletAddress = keypair.publicKey.toBase58();
    const solWalletPrivateKey = bs58.encode(keypair.secretKey);

    const query = 'INSERT INTO users (telegram_id, password, balance, sol_wallet_address, sol_wallet_private_key, ref_code_invite_others) VALUES ($1, $2, $3, $4, $5, $6)';
    await client.query(query, [telegramId, password, 0, solWalletAddress, solWalletPrivateKey, referralCode]);

    console.log(`User created with Solana wallet: ${solWalletAddress}`);
}

// Generate a unique referral code for the user
async function generateUniqueReferralCode() {
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    return randomCode;
}

// Show welcome message after successful login or account creation
async function showWelcomeMessage(chatId, userId, balance, referralCode) {
    const message = `Welcome back!\n\nYour balance: ${balance} USDT\nReferral code: <code>${referralCode}</code>\nClick and hold on the referral code to copy.`;

    const options = {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: "Add Funds", callback_data: "add_funds" }],
                [{ text: "Logout", callback_data: "logout" }],
            ],
        },
    };

    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
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

// Function to send a message via Telegram
async function sendMessage(chatId, text, parseMode = 'Markdown') {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
    });
}

// Function to handle "Add Funds" when a user clicks the button
async function handleAddFunds(chatId, telegramId) {
    const user = await getUserByTelegramId(telegramId);

    let solWalletAddress = user.sol_wallet_address;
    let solWalletPrivateKey = user.sol_wallet_private_key;

    if (!solWalletAddress || !solWalletPrivateKey) {
        const keypair = solanaWeb3.Keypair.generate();
        solWalletAddress = keypair.publicKey.toBase58();
        solWalletPrivateKey = bs58.encode(keypair.secretKey);

        const query = `UPDATE users SET sol_wallet_address = $1, sol_wallet_private_key = $2 WHERE telegram_id = $3`;
        await client.query(query, [solWalletAddress, solWalletPrivateKey, telegramId]);

        console.log(`Generated new wallet for user ${telegramId}: ${solWalletAddress}`);
    }

    console.log(`Monitoring wallet: ${solWalletAddress} for user ${telegramId}`);

    await sendMessage(chatId, `Please send USDT to your Solana wallet address:\n<code>${solWalletAddress}</code>`, 'HTML');

    setInterval(async () => {
        await monitorUSDTTransactions(solWalletAddress, user.id);
    }, 15000);
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
