import os
import psycopg2
from flask import Flask, request
from telegram import Update, Bot
from telegram.ext import Dispatcher, CommandHandler, MessageHandler, Filters, CallbackContext

# Configuration
TELEGRAM_TOKEN = '7403620437:AAHUzMiWQt_AHAZ-PwYY0spVfcCKpWFKQoE'
DATABASE_URL = 'postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3'
WEBHOOK_URL = 'https://ftheiromai.onrender.com/webhook'

# Initialize Flask app
app = Flask(__name__)

# Initialize the bot
bot = Bot(token=TELEGRAM_TOKEN)

# Set up the database connection
conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()

# Set up the dispatcher
dispatcher = Dispatcher(bot, None, workers=0)

# Root route to display "Hello World"
@app.route('/')
def hello_world():
    return "Hello World"

# Command handler to start the bot
def start(update: Update, context: CallbackContext):
    update.message.reply_text('Welcome to the bot! Use /register to sign up.')

# Command handler to register a new user
def register(update: Update, context: CallbackContext):
    chat_id = update.message.chat_id
    username = update.message.from_user.username
    password = "default_password"  # This should be replaced with a real password handling mechanism

    try:
        # Insert user into the database
        cursor.execute("""
            INSERT INTO "Users" (username, password, createdAt, updatedAt, balance)
            VALUES (%s, %s, NOW(), NOW(), 0.0) RETURNING id;
        """, (username, password))
        conn.commit()

        user_id = cursor.fetchone()[0]
        update.message.reply_text(f'User registered with ID: {user_id}')

    except Exception as e:
        conn.rollback()
        update.message.reply_text(f'Error registering user: {e}')

# Handle incoming text messages
def handle_message(update: Update, context: CallbackContext):
    update.message.reply_text("I don't understand that command. Use /register to sign up.")

# Add handlers to the dispatcher
dispatcher.add_handler(CommandHandler('start', start))
dispatcher.add_handler(CommandHandler('register', register))
dispatcher.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_message))

# Webhook route
@app.route('/webhook', methods=['POST'])
def webhook():
    update = Update.de_json(request.get_json(), bot)
    dispatcher.process_update(update)
    return 'ok'

# Set the webhook
@app.route('/set_webhook', methods=['GET', 'POST'])
def set_webhook():
    s = bot.set_webhook(WEBHOOK_URL)
    if s:
        return "Webhook setup successful"
    else:
        return "Webhook setup failed"

# Remove the webhook
@app.route('/remove_webhook', methods=['GET', 'POST'])
def remove_webhook():
    s = bot.delete_webhook()
    if s:
        return "Webhook removed"
    else:
        return "Failed to remove webhook"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 10000)))
