const { Telegraf, session } = require('telegraf');
const { Pool } = require('pg');
const express = require('express');
const bodyParser = require('body-parser');
const { createAccount, checkUsernameExists, verifyLogin } = require('./models');

const bot = new Telegraf('7342846547:AAE4mQ4OiMmEyYYwc8SPbN1u3Cf2idfCcxw');
const app = express();
app.use(bodyParser.json());
app.use(bot.webhookCallback('/webhook'));
bot.telegram.setWebhook('https://tradebot-5390.onrender.com/webhook');

// Initialize session middleware
bot.use(session());

bot.start((ctx) => {
    return ctx.reply('Welcome! Please choose an option:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Create Account', callback_data: 'create_account' }],
                [{ text: 'Login', callback_data: 'login' }]
            ]
        }
    });
});

bot.action('create_account', (ctx) => {
    ctx.session.step = 'ask_username';
    return ctx.reply('Please choose a username:');
});

bot.action('login', (ctx) => {
    ctx.session.step = 'ask_login_username';
    return ctx.reply('Please enter your username:');
});

bot.on('text', async (ctx) => {
    const { step } = ctx.session;
    const text = ctx.message.text;

    if (step === 'ask_username') {
        const exists = await checkUsernameExists(text);
        if (exists) {
            return ctx.reply('Username taken, please choose another username:');
        } else {
            ctx.session.username = text;
            ctx.session.step = 'ask_password';
            return ctx.reply('Please choose a password:');
        }
    } else if (step === 'ask_password') {
        await createAccount(ctx.session.username, text);
        ctx.session.step = null;
        return ctx.reply('Account created successfully!');
    } else if (step === 'ask_login_username') {
        const exists = await checkUsernameExists(text);
        if (!exists) {
            return ctx.reply('Username does not exist, please enter a valid username:');
        } else {
            ctx.session.username = text;
            ctx.session.step = 'ask_login_password';
            return ctx.reply('Please enter your password:');
        }
    } else if (step === 'ask_login_password') {
        const isValid = await verifyLogin(ctx.session.username, text);
        if (!isValid) {
            ctx.session.step = 'ask_login_username';
            return ctx.reply('Username or password not correct, please try again:');
        } else {
            ctx.session.step = null;
            return ctx.reply('Login successful!');
        }
    }
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
