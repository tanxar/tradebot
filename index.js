const { Telegraf } = require('telegraf');
const { Pool } = require('pg');
const User = require('./models');

// Initialize the Telegram bot with your API token
const bot = new Telegraf('7342846547:AAE4mQ4OiMmEyYYwc8SPbN1u3Cf2idfCcxw');

// PostgreSQL client setup with your provided URL
const pool = new Pool({
    connectionString: 'postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3'
});

bot.start(async (ctx) => {
    ctx.reply('Welcome! Please choose an option:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Create Account', callback_data: 'create_account' }],
                [{ text: 'Login', callback_data: 'login' }]
            ]
        }
    });
});

// Handle "Create Account" process
bot.action('create_account', async (ctx) => {
    ctx.reply('Choose a username:');
    bot.on('text', async (ctx) => {
        const username = ctx.message.text;
        const userExists = await User.checkUsernameExists(pool, username);
        if (userExists) {
            ctx.reply('Username taken. Please choose another username.');
        } else {
            ctx.reply('Username is available. Please choose a password:');
            bot.on('text', async (ctx) => {
                const password = ctx.message.text;
                await User.createUser(pool, username, password);
                ctx.reply('Account created successfully! Your balance is 0.');
            });
        }
    });
});

// Handle "Login" process
bot.action('login', async (ctx) => {
    ctx.reply('Enter your username:');
    bot.on('text', async (ctx) => {
        const username = ctx.message.text;
        const userExists = await User.checkUsernameExists(pool, username);
        if (!userExists) {
            ctx.reply('Username does not exist. Please try again.');
        } else {
            ctx.reply('Enter your password:');
            bot.on('text', async (ctx) => {
                const password = ctx.message.text;
                const isPasswordCorrect = await User.checkPassword(pool, username, password);
                if (!isPasswordCorrect) {
                    ctx.reply('Username or password is incorrect. Please try again.');
                } else {
                    ctx.reply('Login successful! Welcome back.');
                }
            });
        }
    });
});

bot.launch();
