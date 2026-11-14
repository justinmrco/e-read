require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const valid = require('../utils/validation');
async function main() {
  const { ADMIN_USERNAME: username, ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;
  if (!process.env.MONGODB_URI || !valid.text(username, 3, 50) || !valid.email(email) || !valid.password(password)) throw new Error('Set MONGODB_URI and valid ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD locally.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await User.create({ username: username.trim(), email: email.trim().toLowerCase(), password, role: 'admin' });
  console.log('Administrator created. Remove ADMIN_PASSWORD from the environment.');
}
main().catch(() => { console.error('Admin creation failed. Check local configuration, input requirements, and duplicate accounts.'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
