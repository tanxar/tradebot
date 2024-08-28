const { Sequelize, DataTypes } = require('sequelize');

// Initialize Sequelize with the database connection
const sequelize = new Sequelize('postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3', {
  dialect: 'postgres',
});

// Define the User model
const User = sequelize.define('User', {
  username: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  balance: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0, // Default balance for new users
  },
});

// Sync the model with the database
sequelize.sync({ alter: true }) // 'alter' adjusts the schema to match the model
  .then(() => console.log('Database synced'))
  .catch(err => console.error('Error syncing database:', err));

module.exports = { User, sequelize };
