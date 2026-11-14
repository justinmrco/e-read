const mongoose = require('mongoose');
const bcrypt = require('bcrypt'); // Tambahkan ini

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  role: {
    type: String,
    default: 'user',
    enum: ['user', 'admin']
  },
  tokenVersion: { type: Number, default: 0 },
  cartBookIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
  purchasedBooks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    default: []
  }],
}, { timestamps: true });

/** 🔐 Hash password sebelum disimpan */
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next(); // hanya hash jika password berubah

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    return next(err);
  }
});

/** 🔍 Method untuk membandingkan password lama */
UserSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
