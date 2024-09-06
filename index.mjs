import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import pkg from 'pg';
import * as solanaWeb3 from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import bs58 from 'bs58'; // For decoding base58 private keys

const { Client } = pkg;

// Initialize the Express app
const app = express();
app.use(bodyParser.json());

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

// Object to hold user sessions
let userSessions = {};

// USDT Mint Address on Solana
const usdtMintAddress = new solanaWeb3.PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');

// Phantom wallet address (where USDT will be transferred)
const phantomWalletAddress = 'G2XNkLGnHeFTCj5Eb328t49aV2xL3rYmrwugg4n3BPHm';

// Function to manually check for USDT balance in the wallet
async function checkUSDTBalance(walletAddress, solWalletPrivateKey) {
    const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');

    try {
        if (!solWalletPrivateKey || solWalletPrivateKey.length === 0) {
            throw new Error("Private key is empty or undefined.");
        }

        const privateKeyBytes = bs58.decode(solWalletPrivateKey);
        const keypair = solanaWeb3.Keypair.fromSecretKey(privateKeyBytes);

        // Get the token accounts for USDT owned by this wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            new solanaWeb3.PublicKey(walletAddress),
            { mint: usdtMintAddress }
        );

        if (tokenAccounts.value.length > 0) {
            const tokenAccount = tokenAccounts.value[0].account.data.parsed.info;
            const balance = tokenAccount.tokenAmount.uiAmount;
            return balance;
        } else {
            return 0;
        }
    } catch (error) {
        console.error(`Error while checking USDT balance for wallet ${walletAddress}:`, error.message);
        return null;
    }
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
        } else if (data === 'check_payment') {
            console.log(`Check Payment button clicked by user ${userId}`);
            await handleCheckPayment(chatId, userId);
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

// Function to handle "Add Funds" when a user clicks the button
async function handleAddFunds(chatId, telegramId) {
    const user = await getUserByTelegramId(telegramId);

    let solWalletAddress = user.sol_wallet_address;
    let solWalletPrivateKey = user.sol_wallet_private_key;

    // If no wallet is present, generate one
    if (!solWalletAddress || !solWalletPrivateKey) {
        const keypair = solanaWeb3.Keypair.generate();
        solWalletAddress = keypair.publicKey.toBase58();
        solWalletPrivateKey = bs58.encode(keypair.secretKey);

        // Update the wallet in the database
        const query = `UPDATE users SET sol_wallet_address = $1, sol_wallet_private_key = $2 WHERE telegram_id = $3`;
        await client.query(query, [solWalletAddress, solWalletPrivateKey, telegramId]);

        console.log(`Generated new wallet for user ${telegramId}: ${solWalletAddress}`);
    }

    console.log(`Monitoring wallet: ${solWalletAddress} for user ${telegramId}`);

    // Send the wallet address and show the "Check for payment" button
    const message = `Please send USDT to your Solana wallet address:\n<code>${solWalletAddress}</code>`;
    const options = {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: "Check for payment", callback_data: "check_payment" }],
            ],
        },
    };

    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
    });

    // Store session data for the current chat
    userSessions[chatId] = { solWalletAddress, solWalletPrivateKey };
}

// Handle "Check for payment" when the button is clicked
async function handleCheckPayment(chatId, telegramId) {
    const session = userSessions[chatId];
    if (!session) {
        await sendMessage(chatId, "No active session found. Please try again.");
        return;
    }

    const { solWalletAddress, solWalletPrivateKey } = session;

    const balance = await checkUSDTBalance(solWalletAddress, solWalletPrivateKey);

    if (balance !== null && balance > 0) {
        await sendMessage(chatId, `Payment found: ${balance} USDT`, 'HTML');

        // Update the user's balance in the database
        await updateUserBalance(telegramId, balance);
    } else {
        await sendMessage(chatId, "Payment not found. Please try again later.");
    }
}

// Send a message via Telegram
async function sendMessage(chatId, text, parseMode = 'Markdown') {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
    });
}

// Get user data by Telegram ID
async function getUserByTelegramId(telegramId) {
    const query = 'SELECT * FROM users WHERE telegram_id = $1';
    const result = await client.query(query, [telegramId]);
    return result.rows[0];
}

// Update user balance in the database
async function updateUserBalance(telegramId, amount) {
    const query = `UPDATE users SET balance = balance + $1 WHERE telegram_id = $2`;
    await client.query(query, [amount, telegramId]);
    console.log(`User's balance updated by ${amount} USDT.`);
}

// Function to ask the user for a password (during account creation or login)
async function askForPassword(chatId, userId, action) {
    const message = action === 'create_account'
        ? "Please choose a password to create your account:"
        : "Please enter your password to log in:";

    userSessions[chatId] = { action, userId };  // Store session for account creation or login

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
        const referralCode = await generateUniqueReferralCode(); // Generate a referral code
        await createUser(userId, text, referralCode); // Save password and create the account
        const user = await getUserByTelegramId(userId);
        await showWelcomeMessage(chatId, userId, user.balance, user.ref_code_invite_others); // Show welcome message
        delete userSessions[chatId]; // Clear session after account creation
    } else if (action === 'login') {
        const user = await getUserByTelegramId(userId);
        if (user && user.password === text) { // Check password
            await showWelcomeMessage(chatId, userId, user.balance, user.ref_code_invite_others); // Login success
            delete userSessions[chatId]; // Clear session after login
        } else {
            await sendMessage(chatId, "Incorrect password. Please try again.");
        }
    }
}

// Create a new user in the database
async function createUser(telegramId, password, referralCode) {
    // Generate Solana wallet when creating user
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
        parse_mode: 'HTML', // Enable HTML formatting for referral code
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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
