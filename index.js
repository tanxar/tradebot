const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const { User, sequelize } = require('./models'); // Import sequelize instance for migrations if necessary

const token = '7342846547:AAE4mQ4OiMmEyYYwc8SPbN1u3Cf2idfCcxw'; // Replace with your actual token
const bot = new TelegramBot(token, { polling: false });

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// Set up webhook
const url = 'https://tradebot-5390.onrender.com';  // Replace with your actual URL
const webhookPath = `/bot${token}`;
bot.setWebHook(`${url}${webhookPath}`);

app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('Hello World');
});

// User state management
const userState = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'New Account', callback_data: 'new_account' }],
        [{ text: 'Login', callback_data: 'login' }]
      ]
    }
  };

  bot.sendMessage(chatId, "Welcome to tsourbot. This bot generates profit based on user capital. The bot takes 50% of the profits it creates for you.", options);
});

bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const action = callbackQuery.data;

  if (action === 'new_account') {
    userState[chatId] = { step: 'awaiting_username' };
    bot.sendMessage(chatId, "Choose a username:");
  } else if (action === 'login') {
    userState[chatId] = { step: 'awaiting_login_username' };
    bot.sendMessage(chatId, "Enter your username:");
  } else if (action === 'add_funds') {
    bot.sendMessage(chatId, "Send funds to this address: uygfhvhjvhjvhvgh7646754ftgf (click to copy)");
  } else if (action === 'withdraw') {
    bot.sendMessage(chatId, "Withdraw functionality not implemented yet.");
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!userState[chatId]) {
    return;
  }

  const currentStep = userState[chatId].step;

  if (currentStep === 'awaiting_username') {
    try {
      const userExists = await User.findOne({ where: { username: text } });

      if (userExists) {
        bot.sendMessage(chatId, "This username is already taken. Please choose another one.");
      } else {
        userState[chatId].username = text;
        userState[chatId].step = 'awaiting_password';
        bot.sendMessage(chatId, "Choose a password for your account:");
      }
    } catch (error) {
      console.error("Error checking username:", error);
      bot.sendMessage(chatId, "An error occurred while checking the username. Please try again.");
    }
  } else if (currentStep === 'awaiting_password') {
    const username = userState[chatId].username;

    try {
      const newUser = await User.create({ username, password: text, balance: 0 });
      bot.sendMessage(chatId, `Account created! Username: ${username}\nYour balance: $${newUser.balance}`);

      const options = {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Add Funds', callback_data: 'add_funds' }],
            [{ text: 'Withdraw', callback_data: 'withdraw' }]
          ]
        }
      };

      bot.sendMessage(chatId, `Your balance: $${newUser.balance}`, options);
    } catch (error) {
      console.error("Error creating user:", error);
      bot.sendMessage(chatId, "An error occurred while creating your account. Please try again.");
    }

    delete userState[chatId];
  } else if (currentStep === 'awaiting_login_username') {
    try {
      const user = await User.findOne({ where: { username: text } });

      if (user) {
        userState[chatId] = { username: text, step: 'logged_in' };
        const options = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Add Funds', callback_data: 'add_funds' }],
              [{ text: 'Withdraw', callback_data: 'withdraw' }]
            ]
          }
        };

        bot.sendMessage(chatId, `Login successful!\nYour balance: $${user.balance}`, options);
      } else {
        bot.sendMessage(chatId, `Username "${text}" not found. Please try again.`);

        // Reset the state to allow the user to enter a username again
        userState[chatId].step = 'awaiting_login_username';
      }
    } catch (error) {
      console.error("Error logging in:", error);
      bot.sendMessage(chatId, "An error occurred while logging in. Please try again.");
    }
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
