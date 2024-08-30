import express from 'express';
import { Telegraf, session } from 'telegraf';
import pkg from 'pg';
const { Client } = pkg;

// Initialize the Express app
const app = express();

// Initialize the Telegram bot with your bot token
const bot = new Telegraf('7403620437:AAHUzMiWQt_AHAZ-PwYY0spVfcCKpWFKQoE');

// PostgreSQL connection setup with the provided connection string
const dbClient = new Client({
    connectionString: 'postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3'
});
await dbClient.connect();

// Use session middleware
bot.use(session());

// Route to display "Hello World" when visiting the root URL
app.get('/', (req, res) => {
    res.send('Hello World');
});

// Prompt for username
bot.start((ctx) => {
    ctx.reply('Please enter a username:');
    ctx.session.stage = 'ASK_USERNAME';
});

bot.on('text', async (ctx) => {
    try {
        if (ctx.session.stage === 'ASK_USERNAME') {
            ctx.session.username = ctx.message.text;
            ctx.reply('Please enter a password:');
            ctx.session.stage = 'ASK_PASSWORD';
        } else if (ctx.session.stage === 'ASK_PASSWORD') {
            const password = ctx.message.text;
            await dbClient.query('INSERT INTO "Users" (username, password) VALUES ($1, $2)', [ctx.session.username, password]);
            ctx.reply('Account created successfully!');
            ctx.session.stage = null;
        }
    } catch (error) {
        console.error('Error handling message:', error);
        ctx.reply('An error occurred. Please try again.');
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
