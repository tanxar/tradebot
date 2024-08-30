from flask import Flask, request
import psycopg2
from telegram import Bot, Update
from telegram.ext import Dispatcher, CommandHandler, MessageHandler, Filters
import logging

# Initialize Flask app
app = Flask(__name__)

# Telegram Bot Token
TELEGRAM_BOT_TOKEN = "7403620437:AAHUzMiWQt_AHAZ-PwYY0spVfcCKpWFKQoE"
bot = Bot(token=TELEGRAM_BOT_TOKEN)

# PostgreSQL connection setup
DATABASE_URL = "postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3"
conn = psycopg2.connect(DATABASE_URL, sslmode="require")

# Configure logging
logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)

# Command handler for '/start'
def start(update, context):
    update.message.reply_text("Welcome! Please use /register <username> <password> to register.")

# Message handler for registration
def register(update, context):
    if len(context.args) == 2:
        username = context.args[0]
        password = context.args[1]
        
        # Insert into PostgreSQL
        with conn.cursor() as cur:
            cur.execute("INSERT INTO Users (username, password) VALUES (%s, %s)", (username, password))
            conn.commit()

        update.message.reply_text(f"User {username} registered successfully!")
    else:
        update.message.reply_text("Usage: /register <username> <password>")

# Function to process incoming Telegram updates
def handle_update(update_json):
    update = Update.de_json(update_json, bot)
    dispatcher.process_update(update)

# Initialize dispatcher
dispatcher = Dispatcher(bot, None, workers=0)
dispatcher.add_handler(CommandHandler("start", start))
dispatcher.add_handler(CommandHandler("register", register))

# Flask route to handle webhooks
@app.route("/webhook", methods=["POST"])
def webhook():
    update_json = request.get_json(force=True)
    handle_update(update_json)
    return "OK", 200

# Set webhook
@app.route("/set_webhook", methods=["GET", "POST"])
def set_webhook():
    webhook_url = f"https://ftheiromai.onrender.com/webhook"
    s = bot.set_webhook(webhook_url)
    if s:
        return "Webhook setup successful", 200
    else:
        return "Webhook setup failed", 400

if __name__ == "__main__":
    app.run(port=5000)
