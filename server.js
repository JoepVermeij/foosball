import express from 'express';
import { Rating, TrueSkill } from 'ts-trueskill';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectToDatabase, closeConnection } from './utils/mongodb.js';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Initialize TrueSkill
const ts = new TrueSkill();

// Default TrueSkill rating values
const DEFAULT_RATING = 25.0;
const DEFAULT_DEVIATION = 8.333;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

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

app.get('/history', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'history.html'));
});

// API endpoints
app.get('/api/players', async (req, res) => {
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
app.get('/api/players/:position', async (req, res) => {
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
app.post('/api/players', async (req, res) => {
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
app.post('/api/players/reset-ratings', async (req, res) => {
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

// Get match history
app.get('/api/matches', async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const matches = await db.collection('matches')
      .find({})
      .sort({ timestamp: -1 })
      .limit(50) // Limit to last 50 matches
      .toArray();
    
    await closeConnection();
    res.json(matches || []);
  } catch (error) {
    console.error('Error fetching matches:', error);
    await closeConnection();
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

app.post('/api/match', async (req, res) => {
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

    // Record the match with enhanced details
    const match = {
      team1: {
        defender: team1.defender,
        attacker: team1.attacker,
        defender_rating: newTeam1Ratings[0].mu,
        attacker_rating: newTeam1Ratings[1].mu
      },
      team2: {
        defender: team2.defender,
        attacker: team2.attacker,
        defender_rating: newTeam2Ratings[0].mu,
        attacker_rating: newTeam2Ratings[1].mu
      },
      winner,
      timestamp: new Date(),
      team1_win_probability: ts.expect(team1Ratings, team2Ratings),
      team2_win_probability: ts.expect(team2Ratings, team1Ratings)
    };

    await db.collection('matches').insertOne(match);

    // Log the match result
    console.log('Match recorded:', {
      timestamp: match.timestamp,
      winner: winner === 1 ? 'Team 1' : 'Team 2',
      team1: `${team1.defender} (${match.team1.defender_rating.toFixed(2)}) & ${team1.attacker} (${match.team1.attacker_rating.toFixed(2)})`,
      team2: `${team2.defender} (${match.team2.defender_rating.toFixed(2)}) & ${team2.attacker} (${match.team2.attacker_rating.toFixed(2)})`,
      win_probability: {
        team1: (match.team1_win_probability * 100).toFixed(1) + '%',
        team2: (match.team2_win_probability * 100).toFixed(1) + '%'
      }
    });

    await closeConnection();
    res.json({ success: true, match });
  } catch (error) {
    console.error('Error processing match:', error);
    await closeConnection();
    res.status(500).json({ error: 'Failed to process match' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 