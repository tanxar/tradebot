const { Telegraf } = require('telegraf');
const { Pool } = require('pg');
const fetch = require('node-fetch');

// Telegram Bot Token
const BOT_TOKEN = '7403620437:AAHUzMiWQt_AHAZ-PwYY0spVfcCKpWFKQoE';
const WEBHOOK_URL = 'https://pythontestbot-f4g1.onrender.com';

// PostgreSQL Connection
const pool = new Pool({
  connectionString: 'postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3'
});

const bot = new Telegraf(BOT_TOKEN);

// Set up the webhook
bot.telegram.setWebhook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`);
bot.webhookCallback(`/bot${BOT_TOKEN}`);

// Command handlers
bot.start((ctx) => {
  ctx.reply('Welcome! Please choose an option:', {
    reply_markup: {
      keyboard: [
        [{ text: 'Create account' }],
        [{ text: 'Login' }]
      ],
      resize_keyboard: true
    }
  });
});

// Handle button clicks
bot.hears('Create account', async (ctx) => {
  await ctx.reply('Choose a username:');
  ctx.session.stage = 'create';
});

bot.hears('Login', async (ctx) => {
  await ctx.reply('Enter your username:');
  ctx.session.stage = 'login';
});

// Handle username input
bot.on('text', async (ctx) => {
  const username = ctx.message.text;
  
  if (ctx.session.stage === 'create') {
    // Check if username exists
    const { rows } = await pool.query('SELECT username FROM users WHERE username = $1', [username]);
    
    if (rows.length > 0) {
      await ctx.reply('Username taken. Choose another username:');
    } else {
      ctx.session.username = username;
      await ctx.reply('Choose a password:');
      ctx.session.stage = 'password';
    }
  } else if (ctx.session.stage === 'password') {
    const password = username; // Store the password
    await pool.query('INSERT INTO users (username, password, balance) VALUES ($1, $2, $3)', [ctx.session.username, password, 0]);
    await ctx.reply('Account created successfully!');
    delete ctx.session.stage;
    delete ctx.session.username;
  } else if (ctx.session.stage === 'login') {
    // Check username and password
    const { rows } = await pool.query('SELECT password FROM users WHERE username = $1', [username]);
    
    if (rows.length === 0) {
      await ctx.reply('Username or password incorrect. Try again.');
      ctx.session.stage = 'login';
    } else {
      await ctx.reply('Enter your password:');
      ctx.session.username = username;
      ctx.session.stage = 'password_check';
    }
  } else if (ctx.session.stage === 'password_check') {
    const { rows } = await pool.query('SELECT password FROM users WHERE username = $1', [ctx.session.username]);
    
    if (rows.length > 0 && rows[0].password === username) {
      await ctx.reply('Login successful!');
      delete ctx.session.stage;
      delete ctx.session.username;
    } else {
      await ctx.reply('Username or password incorrect. Try again.');
      delete ctx.session.stage;
      delete ctx.session.username;
    }
  }
});

bot.launch();
