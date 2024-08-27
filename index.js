const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const { User } = require('./models'); // Importing the User model for database operations

const token = '7342846547:AAE4mQ4OiMmEyYYwc8SPbN1u3Cf2idfCcxw'; // Your actual Telegram bot token
const bot = new TelegramBot(token, { polling: false }); // Initialize the bot without polling (we use webhooks)

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json()); // Middleware to parse JSON requests

// Set up webhook for Telegram bot
const url = 'https://tradebot-5390.onrender.com';  // Replace with your actual Render.com URL
const webhookPath = `/bot${token}`;
bot.setWebHook(`${url}${webhookPath}`);

// Handle incoming updates from the Telegram bot
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body); // Process the incoming Telegram update
  res.sendStatus(200); // Send a 200 OK response to Telegram
});

// Default route to check if the server is running
app.get('/', (req, res) => {
  res.send('Hello World'); // Basic response to indicate the server is live
});

// Object to manage user state during the interaction
const userState = {};

// Handle the /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  // Options for the inline keyboard with "Create Account" and "Login" buttons
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Create Account', callback_data: 'create_account' }],
        [{ text: 'Login', callback_data: 'login' }]
      ]
    }
  };

  // Send welcome message with the inline keyboard
  bot.sendMessage(chatId, "Welcome to the bot! Please choose an option:", options);
});

// Handle callback queries (button clicks)
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const action = callbackQuery.data;

  if (action === 'create_account') {
    // Start the process of creating a new account
    userState[chatId] = { step: 'awaiting_username' };
    bot.sendMessage(chatId, "Choose a username:");
  } else if (action === 'login') {
    // Start the process of logging in
    userState[chatId] = { step: 'awaiting_login_username' };
    bot.sendMessage(chatId, "Enter your username:");
  }
});

// Handle general messages (used for username/password inputs)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // If there's no state for the user, ignore the message
  if (!userState[chatId]) {
    return;
  }

  const currentStep = userState[chatId].step;

  // Handle the username input during account creation
  if (currentStep === 'awaiting_username') {
    try {
      // Check if the username already exists
      const userExists = await User.findOne({ where: { username: text } });

      if (userExists) {
        // Username is taken, ask for a different one
        bot.sendMessage(chatId, "This username is already taken. Please choose another one.");
      } else {
        // Username is available, proceed to password creation
        userState[chatId] = { username: text, step: 'awaiting_password' };
        bot.sendMessage(chatId, "Choose a password for your account:");
      }
    } catch (error) {
      console.error("Error checking username:", error);
      bot.sendMessage(chatId, "An error occurred while checking the username. Please try again.");
    }
  } else if (currentStep === 'awaiting_password') {
    const username = userState[chatId].username;

    try {
      // Create a new user with the provided username and password, set initial balance to 0
      await User.create({ username, password: text, balance: 0 });
      bot.sendMessage(chatId, "Account created successfully! You can now log in.");

      // Clear the user's state after account creation
      delete userState[chatId];
    } catch (error) {
      console.error("Error creating user:", error);
      bot.sendMessage(chatId, "An error occurred while creating your account. Please try again.");
    }
  } else if (currentStep === 'awaiting_login_username') {
    try {
      // Attempt to find the user by username
      const user = await User.findOne({ where: { username: text } });

      if (user) {
        // If the user exists, proceed to password verification
        userState[chatId] = { username: text, step: 'awaiting_login_password' };
        bot.sendMessage(chatId, "Enter your password:");
      } else {
        // Username not found, ask for a different one
        bot.sendMessage(chatId, `Username "${text}" not found. Please enter a different username:`);
      }
    } catch (error) {
      console.error("Error checking username:", error);
      bot.sendMessage(chatId, "An error occurred while logging in. Please try again.");
    }
  } else if (currentStep === 'awaiting_login_password') {
    const username = userState[chatId].username;

    try {
      // Find the user by username and check the password
      const user = await User.findOne({ where: { username, password: text } });

      if (user) {
        // If the password is correct, log them in and show their balance
        bot.sendMessage(chatId, `Login successful!\nYour balance: $${user.balance}`);

        // Show options to add funds or withdraw
        const options = {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Add Funds', callback_data: 'add_funds' }],
              [{ text: 'Withdraw', callback_data: 'withdraw' }]
            ]
          }
        };

        bot.sendMessage(chatId, `Your balance: $${user.balance}`, options);
        delete userState[chatId]; // Clear the user's state after login
      } else {
        // If the password is incorrect, restart the login process
        bot.sendMessage(chatId, "Username or password incorrect. Please enter your username again:");
        userState[chatId].step = 'awaiting_login_username'; // Reset step to allow re-entry
      }
    } catch (error) {
      console.error("Error verifying password:", error);
      bot.sendMessage(chatId, "An error occurred while logging in. Please try again.");
    }
  }
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
