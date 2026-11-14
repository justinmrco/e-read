const mongoose = require('mongoose');
// One document makes ordering atomic on standalone MongoDB; existing Book IDs stay unchanged.
const schema = new mongoose.Schema({
  _id: { type: String, default: 'main' },
  bookIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
  revision: { type: Number, default: 0 },
});
module.exports = mongoose.model('Catalog', schema);
