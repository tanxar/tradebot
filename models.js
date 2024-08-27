const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://users_info_6gu3_user:RFH4r8MZg0bMII5ruj5Gly9fwdTLAfSV@dpg-cr6vbghu0jms73ffc840-a/users_info_6gu3',
});

const createAccount = async (username, password) => {
    const client = await pool.connect();
    try {
        await client.query('INSERT INTO users (username, password, balance) VALUES ($1, $2, $3)', [username, password, 0]);
    } finally {
        client.release();
    }
};

const checkUsernameExists = async (username) => {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM users WHERE username = $1', [username]);
        return res.rows.length > 0;
    } finally {
        client.release();
    }
};

const verifyLogin = async (username, password) => {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        return res.rows.length > 0;
    } finally {
        client.release();
    }
};

module.exports = {
    createAccount,
    checkUsernameExists,
    verifyLogin,
};
