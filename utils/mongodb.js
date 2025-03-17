import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'foosball';

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env');
}

let cachedClient = null;
let cachedDb = null;

export async function connectToDatabase() {
  try {
    if (cachedClient && cachedDb) {
      // Test if the connection is still alive
      try {
        await cachedDb.command({ ping: 1 });
        return { client: cachedClient, db: cachedDb };
      } catch (error) {
        // If the connection is dead, close it and create a new one
        await closeConnection();
      }
    }

    console.log('Connecting to MongoDB...');
    const client = await MongoClient.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });
    
    console.log('Connected to MongoDB');
    const db = client.db(MONGODB_DB);
    
    // Test the connection
    await db.command({ ping: 1 });
    console.log('Database connection tested successfully');
    
    cachedClient = client;
    cachedDb = db;

    return { client, db };
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw new Error(`Failed to connect to database: ${error.message}`);
  }
}

export async function closeConnection() {
  if (cachedClient) {
    try {
      await cachedClient.close();
      console.log('MongoDB connection closed');
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    } finally {
      cachedClient = null;
      cachedDb = null;
    }
  }
} 