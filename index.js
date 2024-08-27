const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const { User } = require('./models');

// Replace with your actual bot token
const token = '7342846547:AAE4mQ4OiMmEyYYwc8SPbN1u3Cf2idfCcxw';
const bot = new TelegramBot(token, { polling: false });

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Set webhook URL
const url = `https://tradebot-5390.onrender.com/bot${token}`;
bot.setWebHook(url)
  .then(() => console.log('Webhook set successfully'))
  .catch(err => console.error('Error setting webhook:', err));

// User sessions to handle the bot state
let userSessions = {};

// Start command handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!userSessions[chatId]) {
    userSessions[chatId] = { state: 'START' };
  }

  const state = userSessions[chatId].state;

  try {
    if (text === '/start' || state === 'START') {
      bot.sendMessage(chatId, 'Welcome to the bot! Choose an option:', {
        reply_markup: {
          keyboard: [['Create Account', 'Login']],
          one_time_keyboard: true,
        },
      });
      userSessions[chatId].state = 'CHOOSING_ACTION';
    } else if (state === 'CHOOSING_ACTION') {
      if (text === 'Create Account') {
        userSessions[chatId].state = 'CHOOSE_USERNAME';
        bot.sendMessage(chatId, 'Choose a username:');
      } else if (text === 'Login') {
        userSessions[chatId].state = 'ENTER_USERNAME';
        bot.sendMessage(chatId, 'Enter your username:');
      } else {
        bot.sendMessage(chatId, 'Unknown option. Please choose "Create Account" or "Login".');
      }
    } else if (state === 'CHOOSE_USERNAME') {
      userSessions[chatId].username = text;
      userSessions[chatId].state = 'CHOOSE_PASSWORD';
      bot.sendMessage(chatId, 'Choose a password:');
    } else if (state === 'CHOOSE_PASSWORD') {
      const password = text;
      try {
        await User.create({ username: userSessions[chatId].username, password, balance: 0 });
        bot.sendMessage(chatId, 'Account created successfully. Your balance is $0.');
      } catch (error) {
        bot.sendMessage(chatId, 'Error creating account. Username may already be taken.');
      }
      userSessions[chatId].state = 'START';
    } else if (state === 'ENTER_USERNAME') {
      const user = await User.findOne({ where: { username: text } });
      if (!user) {
        bot.sendMessage(chatId, 'Username does not exist. Please try again.');
        return; // Restart the process
      }
      userSessions[chatId].username = text;
      userSessions[chatId].state = 'ENTER_PASSWORD';
      bot.sendMessage(chatId, 'Enter your password:');
    } else if (state === 'ENTER_PASSWORD') {
      const user = await User.findOne({ where: { username: userSessions[chatId].username } });
      if (user.password !== text) {
        bot.sendMessage(chatId, 'Username or password incorrect. Please try again.');
        userSessions[chatId].state = 'ENTER_USERNAME'; // Restart login process
      } else {
        bot.sendMessage(chatId, `Login successful! Your balance is $${user.balance}.`);
        bot.sendMessage(chatId, 'Choose an action:', {
          reply_markup: {
            keyboard: [['Add Funds', 'Withdraw']],
            one_time_keyboard: true,
          },
        });
        userSessions[chatId].state = 'CHOOSE_ACTION';
      }
    } else if (state === 'CHOOSE_ACTION') {
      if (text === 'Add Funds') {
        bot.sendMessage(chatId, 'Send funds to this address: `uygfhvhjvhjvhvgh7646754ftgf` (click to copy)');
      } else if (text === 'Withdraw') {
        bot.sendMessage(chatId, 'To withdraw funds, please contact support.');
      } else {
        bot.sendMessage(chatId, 'Unknown action. Please choose "Add Funds" or "Withdraw".');
      }
    }
  } catch (error) {
    console.error('Error handling message:', error);
    bot.sendMessage(chatId, 'An error occurred. Please try again.');
  }
});

// Express route to handle webhook
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
