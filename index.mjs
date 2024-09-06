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

let userSessions = {};

// USDT Mint Address on Solana
const usdtMintAddress = new solanaWeb3.PublicKey('Es9vMFrzdQvAx2eWtS5tybVopF3WQihDnm1HmwW8VaMF');

// Phantom wallet address (where USDT will be transferred)
const phantomWalletAddress = 'G2XNkLGnHeFTCj5Eb328t49aV2xL3rYmrwugg4n3BPHm'; // Replace with your actual Phantom wallet address

// Function to monitor USDT transactions and transfer to Phantom Wallet
async function monitorUSDTTransactions(walletAddress, solWalletPrivateKey, userId, lastSignature = null) {
    const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');
    const privateKeyBytes = bs58.decode(solWalletPrivateKey); // Decode base58 private key
    const keypair = solanaWeb3.Keypair.fromSecretKey(privateKeyBytes);

    console.log(`Monitoring wallet ${walletAddress} for USDT transactions`);

    try {
        // Fetch token accounts for the wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            new solanaWeb3.PublicKey(walletAddress),
            { mint: usdtMintAddress }
        );

        console.log(`Token accounts: ${JSON.stringify(tokenAccounts)}`);

        if (tokenAccounts.value.length > 0) {
            console.log(`Found token accounts for wallet ${walletAddress}`);

            const tokenAccount = tokenAccounts.value[0].account.data.parsed.info;
            const balance = tokenAccount.tokenAmount.uiAmount;

            console.log(`USDT balance in the wallet: ${balance} USDT`);

            // Fetch transaction signatures, starting from the last known signature if provided
            const signatureOptions = lastSignature ? { until: lastSignature, limit: 5 } : { limit: 5 };
            const signatures = await connection.getConfirmedSignaturesForAddress2(
                new solanaWeb3.PublicKey(walletAddress),
                signatureOptions
            );

            console.log(`Found ${signatures.length} transaction signatures for wallet ${walletAddress}`);

            for (const signatureInfo of signatures) {
                const signature = signatureInfo.signature;

                // Check if the transaction signature is already saved in the database
                const isTransactionAlreadyProcessed = await checkTransactionExists(signature);
                if (!isTransactionAlreadyProcessed) {
                    console.log(`New USDT transaction detected: ${balance} USDT, Signature: ${signature}`);

                    // Step 1: Save transaction to the database
                    await saveTransactionToDatabase(userId, walletAddress, balance, signature);

                    // Step 2: Transfer USDT to Phantom wallet
                    await transferUSDTToPhantomWallet(connection, keypair, phantomWalletAddress, balance);

                    // Update the last signature in the users table
                    await updateLastTransactionSignature(userId, signature);
                } else {
                    console.log(`Transaction ${signature} has already been processed`);
                }
            }
        } else {
            console.log(`No USDT token accounts found for wallet ${walletAddress}`);
        }
    } catch (error) {
        console.error(`Error while monitoring wallet ${walletAddress}:`, error);
    }
}

// Check if the transaction signature is already saved in the database
async function checkTransactionExists(signature) {
    const query = 'SELECT COUNT(*) FROM usdt_transactions WHERE signature = $1';
    const result = await client.query(query, [signature]);
    console.log(`Transaction ${signature} exists: ${result.rows[0].count > 0}`);
    return result.rows[0].count > 0;
}

// Save USDT transaction details to the database
async function saveTransactionToDatabase(userId, walletAddress, amount, signature) {
    const query = `INSERT INTO usdt_transactions (user_id, wallet_address, amount, signature) VALUES ($1, $2, $3, $4)`;
    try {
        await client.query(query, [userId, walletAddress, amount, signature]);
        console.log(`Saved transaction to the database: ${amount} USDT, Signature: ${signature}`);
    } catch (err) {
        console.error("Error saving transaction to database:", err);
    }
}

// Function to transfer USDT to the Phantom Wallet
async function transferUSDTToPhantomWallet(connection, keypair, phantomWalletAddress, amount) {
    const phantomPublicKey = new solanaWeb3.PublicKey(phantomWalletAddress);
    const usdtMintPublicKey = new solanaWeb3.PublicKey(usdtMintAddress);

    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        usdtMintPublicKey,
        keypair.publicKey
    );

    const toTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        usdtMintPublicKey,
        phantomPublicKey
    );

    // Transfer the USDT to the Phantom wallet
    const signature = await transfer(
        connection,
        keypair,
        fromTokenAccount.address,
        toTokenAccount.address,
        keypair,
        amount * 10 ** 6 // Convert to smallest unit (Lamports for USDT)
    );

    console.log(`USDT transferred to Phantom wallet. Transaction signature: ${signature}`);
}

// Update the last known transaction signature for the user
async function updateLastTransactionSignature(userId, signature) {
    const query = `UPDATE users SET last_transaction_signature = $1 WHERE id = $2`;
    await client.query(query, [signature, userId]);
}

// Function to handle "Add Funds" when a user clicks the button
async function handleAddFunds(chatId, telegramId) {
    const user = await getUserByTelegramId(telegramId);

    const solWalletAddress = user.sol_wallet_address;
    const solWalletPrivateKey = user.sol_wallet_private_key;
    const lastSignature = user.last_transaction_signature || null;

    console.log(`Starting to monitor wallet: ${solWalletAddress} for user ${telegramId}`);
    
    // Send the wallet address to the user
    await sendMessage(chatId, `Please send USDT to your Solana wallet address:\n<code>${solWalletAddress}</code>`, 'HTML');

    // Monitor for USDT transactions
    console.log(`Setting up interval to monitor wallet: ${solWalletAddress}`);
    
    // Call the monitoring function every minute
    setInterval(async () => {
        console.log(`Calling monitorUSDTTransactions for wallet: ${solWalletAddress}`);
        await monitorUSDTTransactions(solWalletAddress, solWalletPrivateKey, user.id, lastSignature);
    }, 60000); // Check every minute for incoming transactions
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

// Get user data by Telegram ID
async function getUserByTelegramId(telegramId) {
    const query = 'SELECT * FROM users WHERE telegram_id = $1';
    const result = await client.query(query, [telegramId]);
    return result.rows[0];
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

// Check if user exists in the database
async function checkUserExists(telegramId) {
    const query = 'SELECT COUNT(*) FROM users WHERE telegram_id = $1';
    const result = await client.query(query, [telegramId]);
    return result.rows[0].count > 0;
}

// Create a new user with a generated Solana address
async function createUser(telegramId, password, referralCode) {
    const query = 'INSERT INTO users (telegram_id, password, balance, ref_code_invite_others) VALUES ($1, $2, $3, $4)';
    await client.query(query, [telegramId, password, 0, referralCode]);
}

// Function to ask the user for a password during account creation or login
async function askForPassword(chatId, userId, action) {
    const message = action === 'create_account'
        ? "Please choose a password to create your account:"
        : "Please enter your password to log in:";
    
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

// Handle the password response during account creation or login
async function handlePasswordResponse(chatId, text) {
    const session = userSessions[chatId];

    if (!session) {
        await sendMessage(chatId, "Something went wrong. Please try again.");
        return;
    }

    const { action, userId } = session;

    if (action === 'create_account') {
        const referralCode = await generateUniqueReferralCode();
        await createUser(userId, text, referralCode); // Save the password and create the account
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

    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
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
        const userId = callbackQuery.from.id;
        const data = callbackQuery.data;

        if (data === 'add_funds') {
            console.log(`Add Funds button clicked by user ${userId}`);
            await handleAddFunds(chatId, userId);
        }
    }

    if (message) {
        const chatId = message.chat.id;
        const userId = message.from.id;
        const text = message.text;

        if (userSessions[chatId] && (userSessions[chatId].action === 'create_account' || userSessions[chatId].action === 'login')) {
            await handlePasswordResponse(chatId, text); // Handle password input
        } else if (text === '/start') {
            const firstName = message.from.first_name;
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
