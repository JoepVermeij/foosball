import express from 'express';
import serverless from 'serverless-http';
import { TrueSkill, Rating } from 'ts-trueskill';
import { connectToDatabase, closeConnection } from './utils/mongodb.js';
import cors from 'cors';

const app = express();

// Enable CORS for all routes
app.use(cors({
  origin: ['https://fascinating-clafoutis-9bdd1b.netlify.app', 'http://localhost:8888'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Initialize TrueSkill
const ts = new TrueSkill();

// Default TrueSkill rating values
const DEFAULT_RATING = 25.0;
const DEFAULT_DEVIATION = 8.333;

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// API endpoints
app.get('/players', async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const players = await db.collection('players').find({}).sort({ rating: -1 }).toArray();
    await closeConnection();
    res.json(players || []);
  } catch (error) {
    console.error('Error fetching players:', error);
    await closeConnection();
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Get players by position
app.get('/players/:position', async (req, res) => {
  const position = req.params.position;
  if (!['defender', 'attacker', 'any'].includes(position)) {
    return res.status(400).json({ error: 'Invalid position. Must be defender, attacker, or any' });
  }
  
  try {
    const { db } = await connectToDatabase();
    const query = position === 'any' 
      ? {} 
      : { $or: [{ position }, { position: 'any' }] };
    
    const players = await db.collection('players')
      .find(query)
      .sort({ rating: -1 })
      .toArray();
    
    await closeConnection();
    res.json(players || []);
  } catch (error) {
    console.error('Error fetching players by position:', error);
    await closeConnection();
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Add a new player
app.post('/players', async (req, res) => {
  const { name, position = 'any' } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Player name is required' });
  }
  
  if (!['defender', 'attacker', 'any'].includes(position)) {
    return res.status(400).json({ error: 'Invalid position. Must be defender, attacker, or any' });
  }
  
  try {
    const { db } = await connectToDatabase();
    
    // Check if player already exists
    const existingPlayer = await db.collection('players').findOne({ name: name.trim() });
    if (existingPlayer) {
      await closeConnection();
      return res.status(400).json({ error: 'A player with this name already exists' });
    }
    
    const player = {
      name: name.trim(),
      position,
      rating: DEFAULT_RATING,
      rating_deviation: DEFAULT_DEVIATION
    };
    
    await db.collection('players').insertOne(player);
    await closeConnection();
    res.status(201).json(player);
  } catch (error) {
    console.error('Error adding player:', error);
    await closeConnection();
    res.status(500).json({ error: 'Failed to add player' });
  }
});

// Reset all player ratings to default values
app.post('/players/reset-ratings', async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    await db.collection('players').updateMany(
      {},
      { 
        $set: { 
          rating: DEFAULT_RATING,
          rating_deviation: DEFAULT_DEVIATION
        }
      }
    );
    
    await closeConnection();
    res.json({ 
      success: true, 
      message: 'All player ratings have been reset to default values'
    });
  } catch (error) {
    console.error('Error resetting ratings:', error);
    await closeConnection();
    res.status(500).json({ error: 'Failed to reset ratings' });
  }
});

app.post('/match', async (req, res) => {
  const { team1, team2, winner } = req.body;
  
  // Validate positions
  if (!team1.defender || !team1.attacker || !team2.defender || !team2.attacker) {
    return res.status(400).json({ error: 'Each team must have a defender and an attacker' });
  }
  
  try {
    const { db } = await connectToDatabase();
    
    // Get all players involved in the match
    const playerNames = [team1.defender, team1.attacker, team2.defender, team2.attacker];
    const players = await db.collection('players')
      .find({ name: { $in: playerNames } })
      .toArray();

    // Create rating objects for TrueSkill
    const ratings = {};
    players.forEach(player => {
      ratings[player.name] = new Rating(player.rating || DEFAULT_RATING, player.rating_deviation || DEFAULT_DEVIATION);
    });

    // Create teams
    const team1Ratings = [
      ratings[team1.defender] || new Rating(DEFAULT_RATING, DEFAULT_DEVIATION),
      ratings[team1.attacker] || new Rating(DEFAULT_RATING, DEFAULT_DEVIATION)
    ];
    
    const team2Ratings = [
      ratings[team2.defender] || new Rating(DEFAULT_RATING, DEFAULT_DEVIATION),
      ratings[team2.attacker] || new Rating(DEFAULT_RATING, DEFAULT_DEVIATION)
    ];

    // Calculate new ratings
    const ranks = winner === 1 ? [0, 1] : [1, 0];
    const [newTeam1Ratings, newTeam2Ratings] = ts.rate([team1Ratings, team2Ratings], ranks);

    // Update ratings in database
    const updates = [
      [team1.defender, newTeam1Ratings[0].mu, newTeam1Ratings[0].sigma],
      [team1.attacker, newTeam1Ratings[1].mu, newTeam1Ratings[1].sigma],
      [team2.defender, newTeam2Ratings[0].mu, newTeam2Ratings[0].sigma],
      [team2.attacker, newTeam2Ratings[1].mu, newTeam2Ratings[1].sigma]
    ];

    for (const [name, rating, deviation] of updates) {
      await db.collection('players').updateOne(
        { name },
        { $set: { rating, rating_deviation: deviation } },
        { upsert: true }
      );
    }

    // Record the match
    await db.collection('matches').insertOne({
      team1_defender: team1.defender,
      team1_attacker: team1.attacker,
      team2_defender: team2.defender,
      team2_attacker: team2.attacker,
      winner,
      timestamp: new Date()
    });

    await closeConnection();
    res.json({ success: true });
  } catch (error) {
    console.error('Error processing match:', error);
    await closeConnection();
    res.status(500).json({ error: 'Failed to process match' });
  }
});

// Export the serverless handler
export const handler = serverless(app);