const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

// Χρησιμοποίησε το token που ανέφερες
const token = '7342846547:AAE4mQ4OiMmEyYYwc8SPbN1u3Cf2idfCcxw';
const bot = new TelegramBot(token);

// Δημιουργία του express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware για body parsing
app.use(bodyParser.json());

// Ρύθμιση webhook
const url = 'https://tradebot-5390.onrender.com';  // Το URL της εφαρμογής σου στο Render
const webhookPath = `/bot${token}`;

// Ρύθμιση του Telegram webhook
bot.setWebHook(`${url}${webhookPath}`);

// Διαχείριση αιτημάτων από το Telegram
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Route για το root path "/"
app.get('/', (req, res) => {
  res.send('Hello World');
});

// Αρχικό μήνυμα με δύο κουμπιά όταν ο χρήστης στέλνει /start
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

// Διαχείριση των απαντήσεων στα κουμπιά
bot.on('callback_query', (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const action = callbackQuery.data;

  if (action === 'new_account') {
    bot.sendMessage(chatId, "You chose to create a new account.");
  } else if (action === 'login') {
    bot.sendMessage(chatId, "You chose to log in.");
  }
});

// Εκκίνηση του server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
