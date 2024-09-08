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
app.use(bodyParser.json()); // Ensure body-parser is set to parse JSON requests

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
    .then(json => {
        if (!json.ok) {
            console.error('Error setting webhook:', json.description);
        } else {
            console.log('Webhook set successfully');
        }
    })
    .catch(err => console.error('Error setting webhook:', err));

// Object to hold user sessions
let userSessions = {};

// USDT Mint Address on Solana
const usdtMintAddress = new solanaWeb3.PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');

// Your Solana private key (converted from base58)
const myAccountPrivateKey = bs58.decode('52P39r6ywe5TmjM6aYxx7mYbYrL5ov8pdAW7vvH7dNSF8WSpWr1tVc9hYrtUmjfyJgPEnz5WTYopgicymcSYWTfe');
const myKeypair = solanaWeb3.Keypair.fromSecretKey(myAccountPrivateKey);

// Function to fetch USDT balance or create token account if none exists
async function fetchUSDTBalanceOrCreateTokenAccount(walletAddress) {
    try {
        const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');
        const walletPublicKey = new solanaWeb3.PublicKey(walletAddress);
        const usdtMintPublicKey = new solanaWeb3.PublicKey(usdtMintAddress); // USDT mint address

        // Get all token accounts for the wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            walletPublicKey,
            { mint: usdtMintPublicKey }
        );

        if (tokenAccounts.value.length === 0) {
            console.log(`No USDT token accounts found for wallet ${walletAddress}. Creating a new token account...`);
            return 0; // Assume balance is 0 since the wallet was just created
        }

        // If token account exists, return the balance
        const tokenAccount = tokenAccounts.value[0].account.data.parsed.info;
        const balance = tokenAccount.tokenAmount.uiAmount;
        return balance;

    } catch (error) {
        console.error(`Error fetching or creating USDT token account: ${error.message}`);
        return 0;
    }
}

// Function to get user's current balance and other relevant data from the database
async function getUserBalanceFromDB(userId) {
    try {
        const query = 'SELECT balance, last_checked_balance, total_funds_sent FROM users WHERE id = $1';
        const result = await client.query(query, [userId]);
        if (result.rows.length > 0) {
            return {
                balance: result.rows[0].balance,
                lastCheckedBalance: result.rows[0].last_checked_balance,
                totalFundsSent: result.rows[0].total_funds_sent,
            };
        }
        return { balance: 0, lastCheckedBalance: 0, totalFundsSent: 0 };
    } catch (error) {
        console.error(`Error fetching user balance from DB: ${error.message}`);
        return { balance: 0, lastCheckedBalance: 0, totalFundsSent: 0 };
    }
}

// Function to update user's balance and last checked balance in the database
async function updateUserBalanceInDB(userId, newBalance, newTotalFundsSent) {
    try {
        const query = 'UPDATE users SET balance = $1, last_checked_balance = $2, total_funds_sent = $3 WHERE id = $4';
        await client.query(query, [newBalance, newBalance, newTotalFundsSent, userId]);
        console.log(`Updated user ${userId}'s balance to ${newBalance}, last checked balance, and total funds sent.`);
    } catch (error) {
        console.error(`Error updating user balance in DB: ${error.message}`);
    }
}

// Fund newly created wallet with 0.0022 SOL
async function fundNewWallet(newWalletPublicKey) {
    try {
        const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');

        // Create the transaction to send SOL
        const transaction = new solanaWeb3.Transaction().add(
            solanaWeb3.SystemProgram.transfer({
                fromPubkey: myKeypair.publicKey,
                toPubkey: newWalletPublicKey,
                lamports: solanaWeb3.LAMPORTS_PER_SOL * 0.0022,
            })
        );

        // Send the transaction
        const signature = await solanaWeb3.sendAndConfirmTransaction(connection, transaction, [myKeypair]);
        console.log(`Funded new wallet ${newWalletPublicKey.toBase58()} with 0.0022 SOL. Transaction signature: ${signature}`);
    } catch (error) {
        console.error(`Error funding new wallet: ${error.message}`);
    }
}

// Function to create a new user in the database
async function createUser(telegramId, password, referralCode) {
    const keypair = solanaWeb3.Keypair.generate();
    const solWalletAddress = keypair.publicKey.toBase58();
    const solWalletPrivateKey = bs58.encode(keypair.secretKey);

    // Fund the newly created wallet with 0.0022 SOL
    await fundNewWallet(keypair.publicKey);

    const query = 'INSERT INTO users (telegram_id, password, balance, sol_wallet_address, sol_wallet_private_key, ref_code_invite_others) VALUES ($1, $2, $3, $4, $5, $6)';
    await client.query(query, [String(telegramId), password, 0, solWalletAddress, solWalletPrivateKey, referralCode]);

    console.log(`User created with Solana wallet: ${solWalletAddress}`);
}

// Function to check for new funds and avoid redundant notifications
async function checkForFunds(chatId, userId, messageId) {
    const user = await getUserByTelegramId(userId);
    const solWalletAddress = user.sol_wallet_address;

    // Fetch current balance in wallet
    const solanaBalance = await fetchUSDTBalanceOrCreateTokenAccount(solWalletAddress);

    // Fetch balance, last checked balance, and total funds from the database
    const { balance: dbBalance, lastCheckedBalance, totalFundsSent } = await getUserBalanceFromDB(userId);

    if (solanaBalance > lastCheckedBalance) {
        const newFunds = solanaBalance - lastCheckedBalance;
        const newTotalFundsSent = totalFundsSent + newFunds;

        // Update the database with the new balance, last checked balance, and total funds sent
        await updateUserBalanceInDB(userId, solanaBalance, newTotalFundsSent);

        const fundsAddedMessage = `New funds detected: ${newFunds} USDT. Total funds received: ${newTotalFundsSent} USDT.`;
        await sendMessage(chatId, fundsAddedMessage); // Notify user about added funds

        // Restart the bot logic from the login phase to show the new balance
        await restartBotAfterFundsAdded(chatId, userId);
    } else {
        await sendMessage(chatId, "No new funds detected. Please try again later.");
    }
}

// Function to restart the bot after funds are detected
async function restartBotAfterFundsAdded(chatId, userId) {
    const user = await getUserByTelegramId(userId);
    const solanaBalance = await fetchUSDTBalanceOrCreateTokenAccount(user.sol_wallet_address);
    await showWelcomeMessage(chatId, userId, solanaBalance, user.ref_code_invite_others);
}

// Function to edit a message in response to a button click
async function editMessage(chatId, messageId, newText, replyMarkup = null, parseMode = 'HTML') {
    const url = `https://api.telegram.org/bot${TOKEN}/editMessageText`;
    const body = {
        chat_id: chatId,
        message_id: messageId,
        text: newText,
        parse_mode: parseMode,
    };

    if (replyMarkup) {
        body.reply_markup = replyMarkup;
    }

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// Handle the login button click and ask for password
async function handleLogin(chatId, userId, messageId) {
    userSessions[chatId] = { action: 'login', userId };
    const message = "Please enter your password to log in:";
    
    await editMessage(chatId, messageId, message);
}

// Handle "Add Funds" when user clicks the button (edit the message instead of sending a new one)
async function handleAddFunds(chatId, userId, messageId) {
    const user = await getUserByTelegramId(userId);

    let solWalletAddress = user.sol_wallet_address;
    let solWalletPrivateKey = user.sol_wallet_private_key;

    if (!solWalletAddress || !solWalletPrivateKey) {
        const keypair = solanaWeb3.Keypair.generate();
        solWalletAddress = keypair.publicKey.toBase58();
        solWalletPrivateKey = bs58.encode(keypair.secretKey);

        const query = `UPDATE users SET sol_wallet_address = $1, sol_wallet_private_key = $2 WHERE telegram_id = $3`;
        await client.query(query, [solWalletAddress, solWalletPrivateKey, userId]);

        console.log(`Generated new wallet for user ${userId}: ${solWalletAddress}`);
    }

    const message = `Please send USDT to your Solana wallet address:\n<code>${solWalletAddress}</code>`;

    // Edit the message instead of sending a new one
    const replyMarkup = {
        inline_keyboard: [
            [{ text: 'Check for Payment', callback_data: 'check_payment' }],
        ],
    };

    await editMessage(chatId, messageId, message, replyMarkup);
}

// Telegram Bot webhook endpoint
app.post('/webhook', async (req, res) => {
    const message = req.body.message;
    const callbackQuery = req.body.callback_query;

    if (callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const messageId = callbackQuery.message.message_id;
        const data = callbackQuery.data;

        if (data === 'create_account') {
            console.log(`Create account clicked by user ${userId}`);
            await askForPassword(chatId, userId, 'create_account');
        } else if (data === 'login') {
            console.log(`Login button clicked by user ${userId}`);
            await handleLogin(chatId, userId, messageId);
        } else if (data === 'add_funds') {
            console.log(`Add Funds button clicked by user ${userId}`);
            await handleAddFunds(chatId, userId, messageId);
        } else if (data === 'check_payment') {
            console.log(`Check for Payment button clicked by user ${userId}`);
            await checkForFunds(chatId, userId, messageId);
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

// Function to get user by Telegram ID
async function getUserByTelegramId(telegramId) {
    const query = 'SELECT * FROM users WHERE telegram_id = $1';
    const result = await client.query(query, [String(telegramId)]);
    return result.rows[0];
}

// Check if user exists in the database by Telegram ID
async function checkUserExists(telegramId) {
    const query = 'SELECT COUNT(*) FROM users WHERE telegram_id = $1';
    const result = await client.query(query, [String(telegramId)]);
    return result.rows[0].count > 0;
}

// Generate a unique referral code for the user
async function generateUniqueReferralCode() {
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    return randomCode;
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
            const solanaBalance = await fetchUSDTBalanceOrCreateTokenAccount(user.sol_wallet_address);
            await updateUserBalanceInDB(userId, solanaBalance);
            await showWelcomeMessage(chatId, userId, solanaBalance, user.ref_code_invite_others);
            delete userSessions[chatId];
        } else {
            await sendMessage(chatId, "Incorrect password. Please try again.");
        }
    }
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

// Function to send a message via Telegram
async function sendMessage(chatId, text, parseMode = 'Markdown') {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
    });
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
