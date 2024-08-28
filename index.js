const { Telegraf } = require('telegraf');
const express = require('express');
const bodyParser = require('body-parser');
const { User } = require('./models');

// Initialize Express
const app = express();
app.use(bodyParser.json());

// Initialize bot with the token
const bot = new Telegraf('7542765454:AAG4dTJYB7e5N73wCfjtAcwe4bCb6bWiHdM');

// State to manage ongoing conversations
const userStates = {};

// Start command
bot.start((ctx) => {
  ctx.reply('Welcome! What would you like to do?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Create Account', callback_data: 'create_account' }],
        [{ text: 'Login', callback_data: 'login' }],
      ],
    },
  });
});

// Create Account Action
bot.action('create_account', (ctx) => {
  const chatId = ctx.chat.id;
  userStates[chatId] = { step: 'username' };
  ctx.reply('Choose a username:');
});

// Handle user input for account creation
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const state = userStates[chatId];

  if (!state) return; // Ignore messages if no ongoing conversation

  try {
    if (state.step === 'username') {
      const username = ctx.message.text;
      const user = await User.findOne({ where: { username } });

      if (user) {
        ctx.reply('Username taken. Please choose another username.');
      } else {
        state.step = 'password';
        state.username = username; // Save username for later use
        ctx.reply('Username available. Please choose a password:');
      }
    } else if (state.step === 'password') {
      const password = ctx.message.text;
      const username = state.username;

      await User.create({ username, password }); // balance is automatically set to 0
      ctx.reply('Account created successfully!');
      delete userStates[chatId]; // Clear state after account creation
    }
  } catch (error) {
    console.error('Error handling text input:', error);
    ctx.reply('An error occurred. Please try again.');
  }
});

// Login Action
bot.action('login', (ctx) => {
  const chatId = ctx.chat.id;
  userStates[chatId] = { step: 'login_username' };
  ctx.reply('Enter your username:');
});

// Handle user input for login
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const state = userStates[chatId];

  if (!state) return; // Ignore messages if no ongoing conversation

  try {
    if (state.step === 'login_username') {
      const username = ctx.message.text;
      const user = await User.findOne({ where: { username } });

      if (!user) {
        ctx.reply('Username does not exist. Please try again.');
      } else {
        state.step = 'login_password';
        state.username = username; // Save username for password check
        ctx.reply('Enter your password:');
      }
    } else if (state.step === 'login_password') {
      const password = ctx.message.text;
      const username = state.username;

      const user = await User.findOne({ where: { username, password } });

      if (user) {
        ctx.reply('Login successful!');
      } else {
        ctx.reply('Username or password not correct. Please try again.');
      }
      delete userStates[chatId]; // Clear state after login attempt
    }
  } catch (error) {
    console.error('Error handling text input during login:', error);
    ctx.reply('An error occurred. Please try again.');
  }
});

// Set webhook
app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

// Set the webhook URL
bot.telegram.setWebhook('https://tradebot-5390.onrender.com/webhook');
