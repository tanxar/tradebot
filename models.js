const { Sequelize, DataTypes } = require('sequelize');

// Set up PostgreSQL connection
const sequelize = new Sequelize('postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3', {
  dialect: 'postgres',
});

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
    defaultValue: 0.0,
  },
});

sequelize.sync();

module.exports = {
  sequelize,
  User,
};
