const { Telegraf } = require('telegraf');
const express = require('express');
const bodyParser = require('body-parser');

// Import the User model from models.js
const { User } = require('./models');

// Initialize Express
const app = express();
app.use(bodyParser.json());

const bot = new Telegraf('7342846547:AAE4mQ4OiMmEyYYwc8SPbN1u3Cf2idfCcxw');

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

bot.action('create_account', (ctx) => {
  ctx.reply('Choose a username:');
  bot.on('text', async (ctx) => {
    const username = ctx.message.text;
    const user = await User.findOne({ where: { username } });

    if (user) {
      ctx.reply('Username taken. Please choose another username.');
    } else {
      ctx.reply('Username available. Please choose a password:');
      bot.once('text', async (ctx) => {
        const password = ctx.message.text;
        await User.create({ username, password });
        ctx.reply('Account created successfully!');
      });
    }
  });
});

bot.action('login', (ctx) => {
  ctx.reply('Enter your username:');
  bot.on('text', async (ctx) => {
    const username = ctx.message.text;
    const user = await User.findOne({ where: { username } });

    if (!user) {
      ctx.reply('Username does not exist. Please try again.');
    } else {
      ctx.reply('Enter your password:');
      bot.once('text', (ctx) => {
        const password = ctx.message.text;
        if (password === user.password) {
          ctx.reply('Login successful!');
        } else {
          ctx.reply('Username or password not correct. Please try again.');
        }
      });
    }
  });
});

// Set webhook
app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

bot.telegram.setWebhook('https://tradebot-5390.onrender.com/webhook');
