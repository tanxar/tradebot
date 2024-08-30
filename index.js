import express from 'express';
import { Telegraf } from 'telegraf';
import pkg from 'pg';
const { Client } = pkg;

// Initialize the Express app
const app = express();

// Initialize the Telegram bot with your bot token
const bot = new Telegraf('7403620437:AAHUzMiWQt_AHAZ-PwYY0spVfcCKpWFKQoE');

// PostgreSQL connection setup
const dbClient = new Client({
    connectionString: 'postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3'
});
await dbClient.connect();

// Add Express middleware for Telegraf
app.use(bot.webhookCallback('/webhook'));

// Set up the webhook route
bot.telegram.setWebhook('https://pythontestbot-f4g1.onrender.com/webhook');

// Initialize session management
bot.use((ctx, next) => {
    if (!ctx.session) {
        ctx.session = {};
    }
    return next();
});

// Start command handler
bot.start((ctx) => {
    ctx.reply('Welcome! Choose an option:', {
        reply_markup: {
            keyboard: [
                [{ text: 'Create account' }],
                [{ text: 'Login' }]
            ],
            resize_keyboard: true
        }
    });
});

// Handler for Create account button
bot.hears('Create account', (ctx) => {
    ctx.reply('Please choose a username:');
    ctx.session.stage = 'CREATE_ACCOUNT';
});

// Handler for Login button
bot.hears('Login', (ctx) => {
    ctx.reply('Please enter your username:');
    ctx.session.stage = 'LOGIN';
});

// Username input handler for account creation
bot.on('text', async (ctx) => {
    if (ctx.session.stage === 'CREATE_ACCOUNT') {
        const username = ctx.message.text;
        const userCheck = await dbClient.query('SELECT * FROM Users WHERE username = $1', [username]);

        if (userCheck.rows.length > 0) {
            ctx.reply('Username taken. Please choose another username:');
        } else {
            ctx.session.username = username;
            ctx.reply('Username is available. Please choose a password:');
            ctx.session.stage = 'SET_PASSWORD';
        }
    } else if (ctx.session.stage === 'SET_PASSWORD') {
        const password = ctx.message.text;
        await dbClient.query('INSERT INTO users(username, password, balance) VALUES($1, $2, 0)', [ctx.session.username, password]);
        ctx.reply('Account created successfully! You can now log in.');
        ctx.session.stage = null;
    } else if (ctx.session.stage === 'LOGIN') {
        const username = ctx.message.text;
        ctx.session.username = username;
        ctx.reply('Please enter your password:');
        ctx.session.stage = 'LOGIN_PASSWORD';
    } else if (ctx.session.stage === 'LOGIN_PASSWORD') {
        const password = ctx.message.text;
        const userCheck = await dbClient.query('SELECT * FROM Users WHERE username = $1 AND password = $2', [ctx.session.username, password]);

        if (userCheck.rows.length > 0) {
            ctx.reply('Login successful!');
        } else {
            ctx.reply('Username or password incorrect. Please try again.');
            ctx.session.stage = 'LOGIN';
        }
    }
});

// Start the server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
