import express from 'express';
import mongoose from 'mongoose';
import { Rating, TrueSkill } from 'ts-trueskill';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const isNetlify = process.env.IS_NETLIFY === 'true';
const useNetlifyApi = process.env.USE_NETLIFY_API === 'true';
const netlifyUrl = process.env.NETLIFY_SITE_URL || '';
const mongoUri = isNetlify ? process.env.MONGODB_URI_PRODUCTION : process.env.MONGODB_URI;

// Initialize TrueSkill
const ts = new TrueSkill();

// Default TrueSkill rating values
const DEFAULT_RATING = 25.0;
const DEFAULT_DEVIATION = 8.333;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// MongoDB Models
const playerSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  position: { type: String, enum: ['defender', 'attacker', 'any'], default: 'any' },
  rating: { type: Number, default: DEFAULT_RATING },
  rating_deviation: { type: Number, default: DEFAULT_DEVIATION }
});

const matchSchema = new mongoose.Schema({
  team1_defender: String,
  team1_attacker: String,
  team2_defender: String,
  team2_attacker: String,
  winner: Number,
  timestamp: { type: Date, default: Date.now }
});

const Player = mongoose.model('Player', playerSchema);
const Match = mongoose.model('Match', matchSchema);

// MongoDB Connection
mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Helper function to make Netlify API calls
async function callNetlifyApi(endpoint, method = 'GET', data = null) {
  if (!useNetlifyApi || !netlifyUrl) {
    throw new Error('Netlify API is not configured');
  }

  try {
    const url = `${netlifyUrl}/.netlify/functions/api${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.data = data;
    }

    const response = await axios(url, options);
    return response.data;
  } catch (error) {
    console.error(`Error calling Netlify API: ${error.message}`);
    throw error;
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/match', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'match.html'));
});

app.get('/users', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'users.html'));
});

// API endpoints
app.get('/api/players', async (req, res) => {
  if (useNetlifyApi) {
    try {
      const data = await callNetlifyApi('/players');
      return res.json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  try {
    const players = await Player.find().sort({ rating: -1 });
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get players by position
app.get('/api/players/:position', async (req, res) => {
  const position = req.params.position;
  if (!['defender', 'attacker', 'any'].includes(position)) {
    return res.status(400).json({ error: 'Invalid position. Must be defender, attacker, or any' });
  }
  
  if (useNetlifyApi) {
    try {
      const data = await callNetlifyApi(`/players/${position}`);
      return res.json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  
  try {
    const query = position === 'any' 
      ? {} 
      : { $or: [{ position }, { position: 'any' }] };
    
    const players = await Player.find(query).sort({ rating: -1 });
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new player
app.post('/api/players', async (req, res) => {
  const { name, position = 'any' } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Player name is required' });
  }
  
  if (!['defender', 'attacker', 'any'].includes(position)) {
    return res.status(400).json({ error: 'Invalid position. Must be defender, attacker, or any' });
  }
  
  if (useNetlifyApi) {
    try {
      const data = await callNetlifyApi('/players', 'POST', { name, position });
      return res.json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  
  try {
    const player = new Player({
      name: name.trim(),
      position,
      rating: DEFAULT_RATING,
      rating_deviation: DEFAULT_DEVIATION
    });
    
    await player.save();
    res.status(201).json(player);
  } catch (error) {
    if (error.code === 11000) { // MongoDB duplicate key error
      return res.status(400).json({ error: 'A player with this name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Reset all player ratings to default values
app.post('/api/players/reset-ratings', async (req, res) => {
  if (useNetlifyApi) {
    try {
      const data = await callNetlifyApi('/players/reset-ratings', 'POST');
      return res.json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  
  try {
    await Player.updateMany(
      {},
      { 
        $set: { 
          rating: DEFAULT_RATING,
          rating_deviation: DEFAULT_DEVIATION
        }
      }
    );
    
    res.json({ 
      success: true, 
      message: 'All player ratings have been reset to default values'
    });
  } catch (error) {
    console.error('Error resetting ratings:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/match', async (req, res) => {
  const { team1, team2, winner } = req.body;
  
  // Validate positions
  if (!team1.defender || !team1.attacker || !team2.defender || !team2.attacker) {
    return res.status(400).json({ error: 'Each team must have a defender and an attacker' });
  }
  
  if (useNetlifyApi) {
    try {
      const data = await callNetlifyApi('/match', 'POST', { team1, team2, winner });
      return res.json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  
  try {
    // Get all players involved in the match
    const playerNames = [team1.defender, team1.attacker, team2.defender, team2.attacker];
    
    // Get current ratings for all players
    const players = await Player.find({ name: { $in: playerNames } });
    
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
      { name: team1.defender, rating: newTeam1Ratings[0].mu, rating_deviation: newTeam1Ratings[0].sigma },
      { name: team1.attacker, rating: newTeam1Ratings[1].mu, rating_deviation: newTeam1Ratings[1].sigma },
      { name: team2.defender, rating: newTeam2Ratings[0].mu, rating_deviation: newTeam2Ratings[0].sigma },
      { name: team2.attacker, rating: newTeam2Ratings[1].mu, rating_deviation: newTeam2Ratings[1].sigma }
    ];

    await Promise.all(updates.map(update => 
      Player.findOneAndUpdate(
        { name: update.name },
        { $set: { rating: update.rating, rating_deviation: update.rating_deviation } },
        { upsert: true }
      )
    ));

    // Record the match
    await new Match({
      team1_defender: team1.defender,
      team1_attacker: team1.attacker,
      team2_defender: team2.defender,
      team2_attacker: team2.attacker,
      winner
    }).save();

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing match:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    environment: isNetlify ? 'netlify' : 'local',
    usingNetlifyApi: useNetlifyApi,
    database: 'mongodb'
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  if (useNetlifyApi) {
    console.log(`Using Netlify API at ${netlifyUrl}`);
  }
}); 