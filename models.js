const bcrypt = require('bcrypt');

const User = {
    async checkUsernameExists(pool, username) {
        const res = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        return res.rowCount > 0;
    },

    async createUser(pool, username, password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (username, password, balance) VALUES ($1, $2, $3)', [username, hashedPassword, 0]);
    },

    async checkPassword(pool, username, password) {
        const res = await pool.query('SELECT password FROM users WHERE username = $1', [username]);
        if (res.rowCount === 0) return false;
        const user = res.rows[0];
        return await bcrypt.compare(password, user.password);
    }
};

module.exports = User;
