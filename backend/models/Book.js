const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  author: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  format: { type:String, trim:true, maxlength:100, default:'' },
  publisher: { type:String, trim:true, maxlength:200, default:'' },
  pages: { type:Number, min:1, max:100000, validate:value => value === null || Number.isInteger(value), default:null },
  archived: { type: Boolean, default: false },
  hook: { type:String, trim:true, maxlength:100, default:'' },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000,
  },
  imageUrl: {
    type: String,
    required: true,
    maxlength: 2048,
  },
  genre: {
    type: String,
    required: true,
    enum: [
      'Fiction', 'Sci-Fi', 'Fantasy', 'Romance', 'Comedy', 'Thriller', 'Adventure',
      'Mystery', 'Action', 'Historical'
    ],
  },
  year: {
    type: Number,
    required: true,
    min: 1000,
    max: 3000,
    validate: Number.isInteger,
  },
  price: { // ✅ Tambahkan field harga buku
    type: Number,
    required: true,
    min: 1,
    max: 100000000,
    validate: Number.isSafeInteger,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  order: {
    type: Number,
    required: true,
    default: 0,
  },
  creationKey: { type: String, select: false },
});

// ✅ Optional: Indexing agar pengurutan di landing page lebih efisien
bookSchema.index({ order: 1 });
bookSchema.index({ creationKey: 1 }, { unique: true, partialFilterExpression: { creationKey: { $type: 'string' } } });

module.exports = mongoose.model("Book", bookSchema);
