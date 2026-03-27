import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    try {
      // Drop the old unique index that is preventing new registrations
      await mongoose.connection.collection('users').dropIndex('handle_1');
      console.log('Dropped outdated handle_1 index');
    } catch (e) {
      // It might already be dropped, or the collection might not exist yet
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

export default connectDB;