const { Telegraf } = require('telegraf');
const express = require('express');
const bodyParser = require('body-parser');

// Import the User model from models.js
const { User } = require('./models');

// Initialize Express
const app = express();
app.use(bodyParser.json());

// Initialize bot with the new token
const bot = new Telegraf('7542765454:AAG4dTJYB7e5N73wCfjtAcwe4bCb6bWiHdM');

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
    try {
      const username = ctx.message.text;
      const user = await User.findOne({ where: { username } });

      if (user) {
        ctx.reply('Username taken. Please choose another username.');
      } else {
        ctx.reply('Username available. Please choose a password:');
        bot.once('text', async (ctx) => {
          try {
            const password = ctx.message.text;
            await User.create({ username, password });
            ctx.reply('Account created successfully!');
          } catch (error) {
            console.error('Error creating user:', error);
            ctx.reply('An error occurred while creating your account. Please try again.');
          }
        });
      }
    } catch (error) {
      console.error('Error checking username:', error);
      ctx.reply('An error occurred. Please try again.');
    }
  });
});

bot.action('login', (ctx) => {
  ctx.reply('Enter your username:');
  bot.on('text', async (ctx) => {
    try {
      const username = ctx.message.text;
      const user = await User.findOne({ where: { username } });

      if (!user) {
        ctx.reply('Username does not exist. Please try again.');
      } else {
        ctx.reply('Enter your password:');
        bot.once('text', async (ctx) => {
          try {
            const password = ctx.message.text;
            if (password === user.password) {
              ctx.reply('Login successful!');
            } else {
              ctx.reply('Username or password not correct. Please try again.');
            }
          } catch (error) {
            console.error('Error checking password:', error);
            ctx.reply('An error occurred. Please try again.');
          }
        });
      }
    } catch (error) {
      console.error('Error checking username during login:', error);
      ctx.reply('An error occurred. Please try again.');
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
