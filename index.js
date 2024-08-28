const { Telegraf } = require('telegraf');
const { Sequelize } = require('sequelize');
const User = require('./models');

// Initialize bot with your API token
const bot = new Telegraf('7342846547:AAE4mQ4OiMmEyYYwc8SPbN1u3Cf2idfCcxw');

// PostgreSQL connection using Sequelize
const sequelize = new Sequelize('postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3', {
  dialect: 'postgres',
  logging: false,
});

// Ensure the User model is synced with the database
sequelize.sync();

// Start command - Shows Create Account and Login buttons
bot.start((ctx) => {
  ctx.reply('Welcome! Please choose an option:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Create Account', callback_data: 'create_account' }],
        [{ text: 'Login', callback_data: 'login' }],
      ],
    },
  });
});

// Create Account Process
bot.action('create_account', (ctx) => {
  ctx.reply('Choose a username:');
  bot.on('text', async (ctx) => {
    const username = ctx.message.text;
    const user = await User.findOne({ where: { username } });

    if (user) {
      ctx.reply('Username taken, please choose another:');
    } else {
      ctx.session.username = username;
      ctx.reply('Choose a password:');
      bot.on('text', async (ctx) => {
        const password = ctx.message.text;
        await User.create({ username: ctx.session.username, password, balance: 0 });
        ctx.reply('Account created successfully!');
        ctx.session = null;  // Clear session
        bot.removeTextListener();  // Remove text listener to prevent issues
      });
    }
  });
});

// Login Process
bot.action('login', (ctx) => {
  ctx.reply('Enter your username:');
  bot.on('text', async (ctx) => {
    const username = ctx.message.text;
    const user = await User.findOne({ where: { username } });

    if (!user) {
      ctx.reply('Username does not exist. Please enter again:');
    } else {
      ctx.session.username = username;
      ctx.reply('Enter your password:');
      bot.on('text', (ctx) => {
        const password = ctx.message.text;

        if (user.password !== password) {
          ctx.reply('Username or password not correct. Please try again.');
          ctx.session = null;
          bot.removeTextListener();
          ctx.scene.enter('login');  // Restart login process
        } else {
          ctx.reply('Logged in successfully!');
          ctx.session = null;  // Clear session
          bot.removeTextListener();  // Remove text listener to prevent issues
        }
      });
    }
  });
});

// Start the bot
bot.launch();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
