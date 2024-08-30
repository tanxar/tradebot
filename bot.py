from flask import Flask, request
import psycopg2
from telegram import Update
from telegram.ext import Application, CommandHandler, CallbackContext

# Initialize Flask app
app = Flask(__name__)

# Telegram Bot Token
TELEGRAM_BOT_TOKEN = "7403620437:AAHUzMiWQt_AHAZ-PwYY0spVfcCKpWFKQoE"

# PostgreSQL connection setup
DATABASE_URL = "postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3"
conn = psycopg2.connect(DATABASE_URL, sslmode="require")

# Initialize application
application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

# Command handler for '/start'
async def start(update: Update, context: CallbackContext.DEFAULT_TYPE):
    await update.message.reply_text("Welcome! Please use /register <username> <password> to register.")

# Command handler for '/register'
async def register(update: Update, context: CallbackContext.DEFAULT_TYPE):
    if len(context.args) == 2:
        username = context.args[0]
        password = context.args[1]

        # Insert into PostgreSQL
        with conn.cursor() as cur:
            cur.execute("INSERT INTO Users (username, password) VALUES (%s, %s)", (username, password))
            conn.commit()

        await update.message.reply_text(f"User {username} registered successfully!")
    else:
        await update.message.reply_text("Usage: /register <username> <password>")

# Add handlers to the application
application.add_handler(CommandHandler("start", start))
application.add_handler(CommandHandler("register", register))

# Flask route to handle webhooks
@app.route("/webhook", methods=["POST"])
async def webhook():
    update_json = request.get_json(force=True)
    update = Update.de_json(update_json, application.bot)
    await application.process_update(update)
    return "OK", 200

# Set webhook
@app.route("/set_webhook", methods=["GET", "POST"])
async def set_webhook():
    webhook_url = f"https://ftheiromai.onrender.com/webhook"
    await application.bot.set_webhook(webhook_url)
    return "Webhook setup successful", 200

if __name__ == "__main__":
    app.run(port=10000, debug=True, use_reloader=False)
