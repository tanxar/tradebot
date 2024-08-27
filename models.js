class User {
  static async findByUsername(pool, username) {
    const res = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return res.rows[0];
  }

  static async create(pool, username, password) {
    await pool.query('INSERT INTO users (username, password, balance) VALUES ($1, $2, $3)', [username, password, 0]);
  }
}

module.exports = User;
