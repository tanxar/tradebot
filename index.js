const express = require('express');
const { Telegraf } = require('telegraf');
const { Pool } = require('pg');
const User = require('./models');

const bot = new Telegraf(process.env.BOT_TOKEN || '7342846547:AAE4mQ4OiMmEyYYwc8SPbN1u3Cf2idfCcxw');
const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3'
});

app.use(express.json());

app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body, res);
});

bot.start((ctx) => {
  ctx.reply('Welcome! Please choose an option:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Create account', callback_data: 'create_account' }],
        [{ text: 'Login', callback_data: 'login' }]
      ]
    }
  });
});

bot.action('create_account', (ctx) => {
  ctx.session = { step: 'choose_username' };
  ctx.reply('Please choose a username:');
});

bot.action('login', (ctx) => {
  ctx.session = { step: 'login_username' };
  ctx.reply('Please enter your username:');
});

bot.on('text', async (ctx) => {
  const session = ctx.session || {};

  if (session.step === 'choose_username') {
    const username = ctx.message.text;

    const user = await User.findByUsername(pool, username);
    if (user) {
      ctx.reply('Username is taken. Please choose another username:');
    } else {
      ctx.session.username = username;
      ctx.session.step = 'choose_password';
      ctx.reply('Username is available. Please choose a password:');
    }
  } else if (session.step === 'choose_password') {
    const password = ctx.message.text;

    await User.create(pool, ctx.session.username, password);
    ctx.reply('Account created successfully!');
    ctx.session = null;
  } else if (session.step === 'login_username') {
    const username = ctx.message.text;

    const user = await User.findByUsername(pool, username);
    if (!user) {
      ctx.reply('Username does not exist. Please try again:');
    } else {
      ctx.session.username = username;
      ctx.session.step = 'login_password';
      ctx.reply('Username exists. Please enter your password:');
    }
  } else if (session.step === 'login_password') {
    const password = ctx.message.text;

    const user = await User.findByUsername(pool, ctx.session.username);
    if (user && user.password === password) {
      ctx.reply('Login successful!');
      ctx.session = null;
    } else {
      ctx.reply('Username or password not correct. Please try again:');
      ctx.session.step = 'login_username';
    }
  }
});

bot.launch().then(() => {
  console.log('Bot started successfully');
});

// Setup Express server to handle webhook
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);

  const webhookUrl = `${process.env.URL}/webhook`;
  try {
    await bot.telegram.setWebhook(webhookUrl);
    console.log(`Webhook set to ${webhookUrl}`);
  } catch (error) {
    console.error('Error setting webhook:', error);
  }
});
