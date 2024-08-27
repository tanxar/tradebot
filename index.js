const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const { User } = require('./models'); // Import the User model

const token = '7342846547:AAE4mQ4OiMmEyYYwc8SPbN1u3Cf2idfCcxw'; // Your actual Telegram bot token
const bot = new TelegramBot(token, { polling: false }); // Initialize the bot without polling

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json()); // Middleware to parse JSON requests

// Set up webhook for Telegram bot
const url = `https://your-render-url.com/bot${token}`; // Replace with your actual Render URL
bot.setWebHook(url);

let userSessions = {}; // Object to keep track of user sessions

// Start message handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Initialize user session if not present
  if (!userSessions[chatId]) {
    userSessions[chatId] = { state: 'START' };
  }

  if (text === '/start' || userSessions[chatId].state === 'START') {
    // Show the initial buttons
    bot.sendMessage(chatId, 'Welcome to the bot! Choose an option:', {
      reply_markup: {
        keyboard: [
          ['Create Account', 'Login']
        ],
        one_time_keyboard: true
      }
    });
    userSessions[chatId].state = 'CHOOSING_ACTION';
  } else if (userSessions[chatId].state === 'CHOOSING_ACTION') {
    if (text === 'Create Account') {
      userSessions[chatId].state = 'CHOOSE_USERNAME';
      bot.sendMessage(chatId, 'Choose a username:');
    } else if (text === 'Login') {
      userSessions[chatId].state = 'ENTER_USERNAME';
      bot.sendMessage(chatId, 'Enter your username:');
    } else {
      bot.sendMessage(chatId, 'Unknown option. Please choose "Create Account" or "Login".');
    }
  } else if (userSessions[chatId].state === 'CHOOSE_USERNAME') {
    const username = text;
    userSessions[chatId].username = username;
    userSessions[chatId].state = 'CHOOSE_PASSWORD';
    bot.sendMessage(chatId, 'Choose a password:');
  } else if (userSessions[chatId].state === 'CHOOSE_PASSWORD') {
    const password = text;
    try {
      // Create a new user with balance = 0
      await User.create({ username: userSessions[chatId].username, password });
      bot.sendMessage(chatId, 'Account created successfully. Your balance is $0.');
    } catch (error) {
      bot.sendMessage(chatId, 'Error creating account. Maybe the username is already taken.');
    }
    // Reset state after account creation
    userSessions[chatId].state = 'START';
  } else if (userSessions[chatId].state === 'ENTER_USERNAME') {
    const username = text;
    const user = await User.findOne({ where: { username } });
    if (!user) {
      bot.sendMessage(chatId, 'Username does not exist. Please try again.');
      return; // Restart the process
    }
    userSessions[chatId].username = username;
    userSessions[chatId].state = 'ENTER_PASSWORD';
    bot.sendMessage(chatId, 'Enter your password:');
  } else if (userSessions[chatId].state === 'ENTER_PASSWORD') {
    const password = text;
    const user = await User.findOne({ where: { username: userSessions[chatId].username } });
    if (user.password !== password) {
      bot.sendMessage(chatId, 'Username or password incorrect. Please try again.');
      userSessions[chatId].state = 'ENTER_USERNAME'; // Restart login process
    } else {
      bot.sendMessage(chatId, `Login successful! Your balance is $${user.balance}.`);
      bot.sendMessage(chatId, 'Choose an action:', {
        reply_markup: {
          keyboard: [
            ['Add Funds', 'Withdraw']
          ],
          one_time_keyboard: true
        }
      });
      userSessions[chatId].state = 'CHOOSE_ACTION';
    }
  } else if (userSessions[chatId].state === 'CHOOSE_ACTION') {
    if (text === 'Add Funds') {
      bot.sendMessage(chatId, 'Send funds to this address: `uygfhvhjvhjvhvgh7646754ftgf` (click to copy)');
    } else if (text === 'Withdraw') {
      bot.sendMessage(chatId, 'To withdraw funds, please contact support.');
    } else {
      bot.sendMessage(chatId, 'Unknown action. Please choose "Add Funds" or "Withdraw".');
    }
  }
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
