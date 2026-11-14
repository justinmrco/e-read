const mongoose = require('mongoose');
function text(value, min = 1, max = 200) {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max;
}
function password(value) {
  return typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
}
function objectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) && mongoose.Types.ObjectId.isValid(value);
}
function email(value) {
  return text(value, 3, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
module.exports = { text, password, objectId, email };
