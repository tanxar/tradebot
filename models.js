const { Sequelize, DataTypes } = require('sequelize');

// Initialize Sequelize with your database connection
const sequelize = new Sequelize('postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3', {
  dialect: 'postgres',
});

// Define the User model
const User = sequelize.define('User', {
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  balance: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
  },
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt columns
});

// Sync the database (create the table if it doesn't exist)
sequelize.sync()
  .then(() => console.log('Database synchronized'))
  .catch(err => console.error('Error synchronizing database:', err));

module.exports = { User };
