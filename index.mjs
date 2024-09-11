import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import pkg from 'pg';
import * as solanaWeb3 from '@solana/web3.js';
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
// MAKE SURE THE WALLET ONLY HAS SOL, NOT USDT tokens etc.
const myAccountPrivateKey = bs58.decode('2E7FiSKexec7hLBMCqfqum2KEhWLinkzD13wizK1ybV1A1g4ppzQWd6B8xcgcx7ckid16FXj9s5r2qdcdaMHDRjQ');
const myKeypair = solanaWeb3.Keypair.fromSecretKey(myAccountPrivateKey);

// Function to check balance of the funding wallet (myKeypair)
async function checkMyKeypairBalance() {
    const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');
    const balance = await connection.getBalance(myKeypair.publicKey);
    console.log(`MyKeypair balance: ${balance / solanaWeb3.LAMPORTS_PER_SOL} SOL`);
    return balance / solanaWeb3.LAMPORTS_PER_SOL;
}

// Function to fund a newly created wallet
async function fundNewWallet(newWalletPublicKey) {
    try {
        const connection = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com');

        // Check balance of the Phantom wallet (myKeypair)
        const balance = await connection.getBalance(myKeypair.publicKey);
        console.log(`Funding wallet balance: ${balance} lamports`);

        if (balance < solanaWeb3.LAMPORTS_PER_SOL * 0.0022) {
            // throw new Error('Insufficient balance to fund the new wallet.');
             console.log('WARNING: Insufficient balance to fund the new wallet.');

        }

        // Get the account info to make sure it's a system account
        const fromAccountInfo = await connection.getAccountInfo(myKeypair.publicKey);
        
        // If the account contains any data, it's likely not a system (SOL) account
        if (fromAccountInfo && fromAccountInfo.data.length > 0) {
            throw new Error('From account must be a native SOL account and must not carry any data.');
        }

        // Create the transaction to send SOL
        const transaction = new solanaWeb3.Transaction()
            .add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: myKeypair.publicKey, // This should be the Phantom wallet public key
                    toPubkey: newWalletPublicKey, // The new wallet being funded
                    lamports: solanaWeb3.LAMPORTS_PER_SOL * 0.0022, // Convert SOL to lamports
                })
            );

        // Set the fee payer (usually the from account)
        transaction.feePayer = myKeypair.publicKey;

        // Get the latest blockhash to ensure the transaction is valid
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;

        // Simulate the transaction before sending
        const simulationResult = await connection.simulateTransaction(transaction);
        console.log("Transaction Simulation Result:", simulationResult);

        if (simulationResult.value.err) {
            throw new Error('Transaction simulation failed');
        }

        // Send the transaction and confirm it
        const signature = await solanaWeb3.sendAndConfirmTransaction(connection, transaction, [myKeypair]);

        console.log(`Funded new wallet ${newWalletPublicKey.toBase58()} with 0.0022 SOL. Transaction signature: ${signature}`);
    } catch (error) {
        if (error instanceof solanaWeb3.SendTransactionError) {
            console.error("Error funding new wallet:", error.message);
            const logs = error.logs; // Get transaction logs for more details
            console.log("Logs:", logs);
        } else {
            console.error(`General Error: ${error.message}`);
        }
    }
}







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
        return { balance: -66, lastCheckedBalance: -66, totalFundsSent: -66 };
    } catch (error) {
        console.error(`Error fetching user balance from DB: ${error.message}`);
        return { balance: 0, lastCheckedBalance: 0, totalFundsSent: 0 };
    }
}

// Function to update user's balance and last checked balance in the database
async function updateUserBalanceInDB(userId, newBalance, newTotalFundsSent) {
    console.log(`kalestike me values: ${userId},${newBalance},${newTotalFundsSent}`);

    try {
        const query = 'UPDATE users SET balance = $1, last_checked_balance = $2, total_funds_sent = $3 WHERE id = $4';
        await client.query(query, [newBalance, newBalance, newTotalFundsSent, userId]);
        console.log(`Updated user ${userId}'s balance to ${newBalance}, last checked balance, and total funds sent.`);
    } catch (error) {
        console.error(`Error updating user balance in DB: ${error.message}`);
    }
}




// Function to create a new user and wallet
async function createUser(telegramId, password, referralCode) {
    const keypair = solanaWeb3.Keypair.generate();  // Generate a new wallet
    const solWalletAddress = keypair.publicKey.toBase58();
    const solWalletPrivateKey = bs58.encode(keypair.secretKey);

    try {
        // Fund the newly created wallet
        await fundNewWallet(keypair.publicKey);

        console.log(`User created with Solana wallet: ${solWalletAddress}`);
        console.log(`Private key: ${solWalletPrivateKey}`);
        // Here you would insert user details into your database.
        const query = 'INSERT INTO users (telegram_id, password, balance, sol_wallet_address, sol_wallet_private_key, ref_code_invite_others) VALUES ($1, $2, $3, $4, $5, $6)';
        await client.query(query, [String(telegramId), password, 0, solWalletAddress, solWalletPrivateKey, referralCode]);
    
    } catch (error) {
        console.error(`Error creating user: ${error.message}`);
    }
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

// Function to ask for a password when creating an account
async function askForPassword(chatId, userId, action) {
    userSessions[chatId] = { action, userId };
    const message = action === 'create_account' ? "Please enter a password to create your account:" : "Please enter your password:";
    
    await sendMessage(chatId, message);
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
          else if (data === 'withdraw') {
            console.log(`Withdraw button clicked by user ${userId}`);
            await handleWithdraw(chatId, userId, messageId);
        } else if (data === 'confirm_withdraw') {
            console.log(`Confirm withdraw clicked by user ${userId}`);
            await handleConfirmWithdraw(chatId);
        } else if (data === 'cancel_withdraw') {
            console.log(`Cancel withdraw clicked by user ${userId}`);
            await handleCancelWithdraw(chatId);
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
        else if (userSessions[chatId] && userSessions[chatId].action === 'enter_withdraw_amount') {
            await handleWithdrawAmount(chatId, message.message_id, text); // Pass messageId to edit message
        }
         else if (userSessions[chatId] && userSessions[chatId].action === 'enter_withdraw_address') {
            await handleWithdrawAddress(chatId, message.message_id, text); // Pass messageId to edit message
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
            // await updateUserBalanceInDB(userId, solanaBalance); 
            await showWelcomeMessage(chatId, userId, solanaBalance, user.ref_code_invite_others);
            delete userSessions[chatId];
        } else {
            await sendMessage(chatId, "Incorrect password. Please try again.");
        }
    }
}

// Show welcome message after successful login or account creation
async function showWelcomeMessage(chatId, userId, referralCode) {
    try {
        // Query to get the user's balance from the database
        const query = 'SELECT balance FROM users WHERE telegram_id = $1';
        const result = await client.query(query, [String(userId)]);
        
        let balance = 0; // Default balance
        if (result.rows.length > 0) {
            balance = result.rows[0].balance;
        }

        // Compose the welcome message with the user's balance
        const message = `Your balance: ${balance} USDT\nReferral code: <code>${referralCode}</code>\nClick the referral code to copy.`;

        // Define the inline keyboard for options
        const options = {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "➕ Add Funds", callback_data: "add_funds" }],
                    [{ text: "Withdraw", callback_data: "withdraw" }],
                    [{ text: 'Referrals', callback_data: 'referrals' },
                    { text: 'Logout', callback_data: 'logout' }],
                ],
            },
        };

        // Send the message using Telegram API
        await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options),
        });
    } catch (error) {
        console.error(`Error fetching balance or sending welcome message: ${error.message}`);
    }
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


// newwww
// Function to handle the "Withdraw" button click
async function handleWithdraw(chatId, userId, messageId) {
    userSessions[chatId] = { action: 'enter_withdraw_amount', userId };
    const message = "Please enter the amount to withdraw (USDT):";
    
    // Edit the message to ask for the amount
    await editMessage(chatId, messageId, message);
}
// Function to handle user entering the withdrawal amount
async function handleWithdrawAmount(chatId, messageId, amount) {
    const session = userSessions[chatId];

    if (!session || session.action !== 'enter_withdraw_amount') {
        await sendMessage(chatId, "Something went wrong. Please try again.");
        return;
    }

    // Store the entered amount in the session
    session.withdrawAmount = amount;
    session.action = 'enter_withdraw_address';

    const message = "Please enter the wallet address to withdraw to:";
    
    // Edit the previous message to ask for the wallet address
    await editMessage(chatId, messageId, message);
}



// Function to handle user entering the wallet address
async function handleWithdrawAddress(chatId, messageId, address) {
    const session = userSessions[chatId];

    if (!session || session.action !== 'enter_withdraw_address') {
        await sendMessage(chatId, "Something went wrong. Please try again.");
        return;
    }

    // Store the wallet address in the session
    session.withdrawAddress = address;

    // Prepare the confirmation message
    const message = `Withdraw confirmation\n\nWithdraw amount: ${session.withdrawAmount} USDT\nTo wallet: ${session.withdrawAddress}`;
    
    // Add inline keyboard with "Confirm" and "Cancel" buttons
    const replyMarkup = {
        inline_keyboard: [
            [{ text: 'Confirm', callback_data: 'confirm_withdraw' }],
            [{ text: 'Cancel', callback_data: 'cancel_withdraw' }],
        ],
    };

    // Edit the message to show confirmation with the buttons
    await editMessage(chatId, messageId, message, replyMarkup);
}


// Function to handle withdrawal confirmation
async function handleConfirmWithdraw(chatId) {
    const session = userSessions[chatId];

    if (!session || !session.withdrawAmount || !session.withdrawAddress) {
        await sendMessage(chatId, "Something went wrong. Please try again.");
        return;
    }

    // Proceed with the withdrawal logic here (e.g., interacting with the blockchain)
    await sendMessage(chatId, `Withdrawal of ${session.withdrawAmount} USDT to ${session.withdrawAddress} confirmed.`);

    // Clear the session
    delete userSessions[chatId];
}

// Function to handle withdrawal cancellation
async function handleCancelWithdraw(chatId) {
    await sendMessage(chatId, "Withdrawal cancelled.");
    // Clear the session
    delete userSessions[chatId];
}


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


// bgazei error 
