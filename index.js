const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const { User } = require('./models');  // Εισαγωγή του μοντέλου χρήστη

const token = '7342846547:AAE4mQ4OiMmEyYYwc8SPbN1u3Cf2idfCcxw';
const bot = new TelegramBot(token);

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

const url = 'https://tradebot-5390.onrender.com';  
const webhookPath = `/bot${token}`;

bot.setWebHook(`${url}${webhookPath}`);

app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('Hello World');
});

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
    bot.sendMessage(chatId, "Login functionality not implemented yet.");
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
    const userExists = await User.findOne({ where: { username: text } });

    if (userExists) {
      bot.sendMessage(chatId, "This username is already taken. Please choose another one.");
    } else {
      userState[chatId].username = text;
      userState[chatId].step = 'awaiting_password';
      bot.sendMessage(chatId, "Choose a password for your account:");
    }
  } else if (currentStep === 'awaiting_password') {
    const username = userState[chatId].username;

    try {
      await User.create({ username, password: text });
      bot.sendMessage(chatId, `Account created! Username: ${username}`);
    } catch (error) {
      bot.sendMessage(chatId, "An error occurred while creating your account. Please try again.");
    }

    delete userState[chatId];
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
