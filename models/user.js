const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, lowercase:true,  }, // username
  totalScore: { type: Number, default: 0 },             // optional cumulative score
  createdAt: { type: Date, default: Date.now }

});

module.exports = mongoose.model('User', userSchema);
