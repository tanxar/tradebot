import telebot
import psycopg2
from flask import Flask, request

# Telegram bot token
API_TOKEN = '7403620437:AAHUzMiWQt_AHAZ-PwYY0spVfcCKpWFKQoE'
bot = telebot.TeleBot(API_TOKEN)

# Database connection URL
DB_URL = "postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3"

# Flask app
app = Flask(__name__)

# Initialize the bot's webhook
@app.route('/' + API_TOKEN, methods=['POST'])
def webhook():
    bot.process_new_updates([telebot.types.Update.de_json(request.stream.read().decode("utf-8"))])
    return "!", 200

# Welcome message
@bot.message_handler(commands=['start'])
def send_welcome(message):
    bot.reply_to(message, "Welcome! Please send your username and password in the format: /auth username password")

# Handler to save username and password
@bot.message_handler(commands=['auth'])
def handle_auth(message):
    try:
        # Split the message to extract username and password
        command, username, password = message.text.split()

        # Insert into the database
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()

        # Ensure the Users table exists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS Users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL
            )
        """)
        conn.commit()

        # Insert the new user
        cur.execute("INSERT INTO Users (username, password) VALUES (%s, %s)", (username, password))
        conn.commit()

        cur.close()
        conn.close()

        bot.reply_to(message, "User saved successfully!")

    except Exception as e:
        bot.reply_to(message, f"Failed to save user: {str(e)}")

# Set webhook
bot.remove_webhook()
bot.set_webhook(url="https://ftheiromai.onrender.com/" + API_TOKEN)

# Start Flask app
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8443)
