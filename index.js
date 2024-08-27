const TelegramBot = require('node-telegram-bot-api');

// Αντικατέστησε το TOKEN με το δικό σου Telegram bot token
const token = '7342846547:AAE4mQ4OiMmEyYYwc8SPbN1u3Cf2idfCcxw';
const bot = new TelegramBot(token, { polling: true });

// Αρχικό μήνυμα με δύο κουμπιά
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  // Δημιουργία του μηνύματος με τα κουμπιά
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
