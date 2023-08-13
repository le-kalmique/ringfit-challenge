import mongoose from 'mongoose';

// Define a schema for user entries
const userEntrySchema = new mongoose.Schema({
  userId: String,
  username: String,
  hours: Number,
  minutes: Number,
  seconds: Number,
  kcal: Number,
  distance: Number,
  chatId: String,
});

// Create a model based on the schema
const UserEntry = mongoose.model('UserEntry', userEntrySchema);

export { UserEntry };
