// after 420 v3

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
        const balance = parseFloat(tokenAccount.tokenAmount.uiAmount); // Ensure it's a number
        console.log(`USDT balance for wallet ${walletAddress}: ${balance} USDT`);
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
async function updateUserBalanceInDB(userId, newBalance, newCheckedBalance, newTotalFundsSent) {
    console.log(`Updating with values: userId: ${userId}, balance: ${newBalance}, lastCheckedBalance: ${newCheckedBalance}, totalFundsSent: ${newTotalFundsSent}`);

    try {
        const query = 'UPDATE users SET balance = $1, last_checked_balance = $2, total_funds_sent = $3 WHERE telegram_id = $4';
        await client.query(query, [newBalance, newCheckedBalance, newTotalFundsSent, userId]);
        console.log(`Updated user ${userId}'s balance to ${newBalance}, last checked balance to ${newCheckedBalance}, and total funds sent to ${newTotalFundsSent}.`);
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


// Function to delete a message via Telegram API
async function deleteMessage(chatId, messageId) {
    const url = `https://api.telegram.org/bot${TOKEN}/deleteMessage`;
    const body = {
        chat_id: chatId,
        message_id: messageId,
    };

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}



// Function to check for new funds and avoid redundant notifications
async function checkForFunds(chatId, userId, messageId) {
    try {
        const user = await getUserByTelegramId(userId);
        const solWalletAddress = user.sol_wallet_address;

        // Fetch current balance in wallet
        const solanaBalance = await fetchUSDTBalanceOrCreateTokenAccount(solWalletAddress);
        console.log(`Solana balance for wallet ${solWalletAddress}: ${solanaBalance} USDT`);

        // Fetch the user's balance, last checked balance, and total funds sent from the database
        const query = 'SELECT balance, last_checked_balance, total_funds_sent FROM users WHERE telegram_id = $1';
        const result = await client.query(query, [userId]);

        // Check if a user record was found
        if (result.rows.length === 0) {
            await editMessage(chatId, messageId, "User not found in the database.");
            return;
        }

        // Extract values from the database result
        const dbBalance = parseFloat(result.rows[0].balance) || 0;
        const lastCheckedBalance = parseFloat(result.rows[0].last_checked_balance) || 0;
        const totalFundsSent = parseFloat(result.rows[0].total_funds_sent) || 0;

        console.log(`DB balance: ${dbBalance}, Last checked balance: ${lastCheckedBalance}, Total funds sent: ${totalFundsSent}`);

        // Detect if new funds have been received (by comparing with totalFundsSent)
        if (solanaBalance > totalFundsSent) {
            // Calculate the new funds received
            const newFunds = solanaBalance - lastCheckedBalance;
            console.log(`New funds detected: ${newFunds} USDT`);

            // Add new funds to the existing balance from the database
            const updatedBalance = dbBalance + newFunds;
            console.log(`Updated balance: ${updatedBalance} USDT`);

            // Update the database with the new balance, new last_checked_balance, and new totalFundsSent
            const newCheckedBalance = solanaBalance;
            const updateQuery = `
                UPDATE users
                SET balance = $1, last_checked_balance = $2, total_funds_sent = $3
                WHERE telegram_id = $4
            `;
            await client.query(updateQuery, [updatedBalance, newCheckedBalance, solanaBalance, userId]);

            // Notify the user by editing the existing message
            const fundsAddedMessage = `New funds detected: ${newFunds} USDT.`;
            await editMessage(chatId, messageId, fundsAddedMessage);

            // Wait for 1 second, then edit the message to "Restarting bot..."
            setTimeout(async () => {
                const restartingMessage = "Restarting bot...";
                await editMessage(chatId, messageId, restartingMessage);

                // Wait another second, delete the message, and then show the welcome message
                setTimeout(async () => {
                    await deleteMessage(chatId, messageId); // Delete the restarting message
                    await showWelcomeMessage(chatId, userId, user.ref_code_invite_others); // Show welcome message
                }, 1000); // 1000 milliseconds = 1 second
            }, 1000); // 1000 milliseconds = 1 second

        } else {
            // No new funds detected, edit the message to notify the user
            const noFundsMessage = "No new funds detected.";
            await editMessage(chatId, messageId, noFundsMessage);

            // Wait for 1 second, then edit the message to "Restarting bot..."
            setTimeout(async () => {
                const restartingMessage = "Restarting bot...";
                await editMessage(chatId, messageId, restartingMessage);

                // Wait another second, delete the message, and then show the welcome message
                setTimeout(async () => {
                    await deleteMessage(chatId, messageId); // Delete the restarting message
                    await showWelcomeMessage(chatId, userId, user.ref_code_invite_others); // Show welcome message
                }, 1000); // 1000 milliseconds = 1 second
            }, 1000); // 1000 milliseconds = 1 second
        }
    } catch (error) {
        console.error(`Error checking for funds: ${error.message}`);
        await editMessage(chatId, messageId, "An error occurred while checking for new funds. Please try again.");
    }
}








// Function to restart the bot after funds are detected
async function restartBot(chatId, userId) {
    try {
        // Fetch the user data from the database
        const user = await getUserByTelegramId(userId);

        // Fetch the balance stored in the database
        const { balance: dbBalance } = await getUserBalanceFromDB(userId);

        // Fetch the referral code from the user data (if applicable)
        const referralCode = user.ref_code_invite_others || 'N/A';

        // Show the welcome message with the balance from the database
        await showWelcomeMessage(chatId, userId, referralCode);
    } catch (error) {
        console.error(`Error restarting bot after funds added: ${error.message}`);
        await sendMessage(chatId, "An error occurred while updating your balance. Please try again.");
    }
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

app.post('/webhook', async (req, res) => {
    const message = req.body.message;
    const callbackQuery = req.body.callback_query;

    if (callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const messageId = callbackQuery.message.message_id;
        const data = callbackQuery.data;

        // Handle button actions based on callback data
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
        } else if (data === 'withdraw') {
            console.log(`Withdraw button clicked by user ${userId}`);
            await handleWithdraw(chatId, userId, messageId);
        } else if (data === 'confirm_withdrawal') {
            await handleWithdrawConfirmation(chatId, userId, 'confirm_withdrawal');
        } else if (data === 'cancel_withdrawal') {
            await handleWithdrawConfirmation(chatId, userId, 'cancel_withdrawal');
        }
    }

    if (message) {
        const chatId = message.chat.id;
        const userId = message.from.id;
        const text = message.text;

        // Handle commands and text inputs
        if (text === '/start') {
            const firstName = message.from.first_name;
            await showInitialOptions(chatId, userId, firstName);
        } else if (userSessions[chatId] && userSessions[chatId].action === 'withdraw') {
            // Check if user is in the middle of the withdraw process
            await handleWithdrawResponse(chatId, text);
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
        await showWelcomeMessage(chatId, userId, user.ref_code_invite_others);
        delete userSessions[chatId];
    } else if (action === 'login') {
        const user = await getUserByTelegramId(userId);
        if (user && user.password === text) {
            const solanaBalance = await fetchUSDTBalanceOrCreateTokenAccount(user.sol_wallet_address);
            // await updateUserBalanceInDB(userId, solanaBalance); 
            await showWelcomeMessage(chatId, userId, user.ref_code_invite_others);
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



// Function to handle the withdraw button click
async function handleWithdraw(chatId, userId, messageId) {
        // Query to get the user's balance from the database
        const query = 'SELECT balance FROM users WHERE telegram_id = $1';
        const result = await client.query(query, [String(userId)]);
        
        let balance = 0; // Default balance
        if (result.rows.length > 0) {
            balance = result.rows[0].balance;
        }


    // Set user session to track withdrawal process
    userSessions[chatId] = {
        action: 'withdraw',
        userId: userId,
        step: 'enter_amount'
    };

    // Ask the user to enter the withdrawal amount
    const message = `Your balance: ${balance} USDT\nEnter withdraw amount:`;
    await editMessage(chatId, messageId, message);
}

// Function to handle user response during the withdrawal process
async function handleWithdrawResponse(chatId, text) {
    console.log(`Handling withdraw response for chatId: ${chatId}, text: ${text}`);

    const session = userSessions[chatId];

    if (!session || session.action !== 'withdraw') {
        console.log("Session not found or action is not withdraw.");
        await sendMessage(chatId, "Something went wrong. Please try again.");
        return;
    }

    const { userId, step } = session;
    console.log(`Current step: ${step}`);

    // Step 1: Enter Withdrawal Amount
    if (step === 'enter_amount') {
        const amount = parseFloat(text);

        if (isNaN(amount) || amount <= 0 || amount > balance) {
            await sendMessage(chatId, "Please enter a valid withdrawal amount.");
            return;
        }

        // Update session with amount and move to the next step
        userSessions[chatId].withdrawAmount = amount;
        userSessions[chatId].step = 'enter_wallet_address';

        // Ask the user to enter the wallet address
        console.log(`Amount entered: ${amount}. Asking for wallet address.`);
        await sendMessage(chatId, "Please enter the wallet address to receive the USDT:");
    }

    // Step 2: Enter Wallet Address
    else if (step === 'enter_wallet_address') {
        try {
            console.log(`Validating wallet address: ${text}`);
            // Create a PublicKey instance to validate the address
            const walletAddress = new solanaWeb3.PublicKey(text);

            // If no error is thrown, the wallet address is valid
            userSessions[chatId].walletAddress = walletAddress.toBase58();
            userSessions[chatId].step = 'confirm_withdrawal';

            // Display confirmation message
            const { withdrawAmount } = userSessions[chatId];
            const message = `Confirm Withdrawal:\nAmount: ${withdrawAmount} USDT\nTo Wallet: ${walletAddress.toBase58()}\n\nClick confirm to proceed or cancel to abort.`;

            const replyMarkup = {
                inline_keyboard: [
                    [{ text: '✅ Confirm', callback_data: 'confirm_withdrawal' }],
                    [{ text: '❌ Cancel', callback_data: 'cancel_withdrawal' }]
                ]
            };

            console.log("Asking for confirmation.");
            await sendMessage(chatId, message);

        } catch (error) {
            console.error(`Invalid wallet address entered: ${text}`);
            await sendMessage(chatId, "Please enter a valid Solana wallet address.");
        }
    }
}



// Function to handle withdrawal confirmation or cancellation
async function handleWithdrawConfirmation(chatId, userId, action) {
    const session = userSessions[chatId];

    if (!session || session.action !== 'withdraw') {
        await sendMessage(chatId, "Something went wrong. Please try again.");
        return;
    }

    if (action === 'confirm_withdrawal') {
        // Proceed with withdrawal logic here, such as sending the USDT

        const { withdrawAmount, walletAddress } = session;

        // Add your logic here to perform the withdrawal, such as interacting with the Solana blockchain

        // Notify the user of the confirmed withdrawal
        await sendMessage(chatId, `Withdrawal confirmed:\nAmount: ${withdrawAmount} USDT\nTo Wallet: ${walletAddress}`);

        // After confirming, reset the session
        delete userSessions[chatId];

    } else if (action === 'cancel_withdrawal') {
        // Notify the user that the withdrawal was cancelled
        await sendMessage(chatId, "Withdrawal cancelled. Restarting bot...");

        // After cancelling, reset the session and restart the bot
        delete userSessions[chatId];
        await restartBot(chatId, userId);
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


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
