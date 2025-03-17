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

// Add this near the top with other constants
const ADMIN_PASSWORD = 'fdsfrew4234erasdf'; // You can change this password

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
  const password = req.query.password;
  if (password === ADMIN_PASSWORD) {
    res.sendFile(path.join(__dirname, 'public', 'users.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
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
  if (!['defender', 'attacker'].includes(position)) {
    return res.status(400).json({ error: 'Invalid position. Must be defender or attacker' });
  }
  
  try {
    const { db } = await connectToDatabase();
    
    // Get all players with their ratings
    const players = await db.collection('players')
      .find({})
      .project({
        name: 1,
        rating: position === 'defender' ? '$defender_rating' : '$attacker_rating',
        rating_deviation: position === 'defender' ? '$defender_deviation' : '$attacker_deviation'
      })
      .sort({ rating: -1 })
      .toArray();

    // Get match counts for each player
    const matchCounts = await db.collection('matches')
      .aggregate([
        {
          $project: {
            players: position === 'defender' ? 
              ['$team1.defender', '$team2.defender'] : 
              ['$team1.attacker', '$team2.attacker']
          }
        },
        {
          $unwind: '$players'
        },
        {
          $group: {
            _id: '$players',
            count: { $sum: 1 }
          }
        }
      ])
      .toArray();

    // Create a map of player names to match counts
    const matchCountMap = {};
    matchCounts.forEach(({ _id, count }) => {
      matchCountMap[_id] = count;
    });

    // Add match counts to players
    const playersWithCounts = players.map(player => ({
      ...player,
      matches_played: matchCountMap[player.name] || 0
    }));
    
    await closeConnection();
    res.json(playersWithCounts || []);
  } catch (error) {
    console.error('Error fetching players by position:', error);
    await closeConnection();
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Add a new player
app.post('/api/players', async (req, res) => {
  const { name } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Player name is required' });
  }
  
  try {
    const { db } = await connectToDatabase();
    
    // Check if player already exists
    const existingPlayer = await db.collection('players').findOne({ name: name.trim() });
    
    if (existingPlayer) {
      await closeConnection();
      return res.status(400).json({ error: 'A player with this name already exists' });
    }
    
    // Create player with both ratings
    const player = {
      name: name.trim(),
      defender_rating: DEFAULT_RATING,
      defender_deviation: DEFAULT_DEVIATION,
      attacker_rating: DEFAULT_RATING,
      attacker_deviation: DEFAULT_DEVIATION
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
          defender_rating: DEFAULT_RATING,
          defender_deviation: DEFAULT_DEVIATION,
          attacker_rating: DEFAULT_RATING,
          attacker_deviation: DEFAULT_DEVIATION
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
      // Use defender rating for defender position
      ratings[`${player.name}_defender`] = new Rating(
        player.defender_rating || DEFAULT_RATING, 
        player.defender_deviation || DEFAULT_DEVIATION
      );
      // Use attacker rating for attacker position
      ratings[`${player.name}_attacker`] = new Rating(
        player.attacker_rating || DEFAULT_RATING, 
        player.attacker_deviation || DEFAULT_DEVIATION
      );
    });

    // Create teams with role-specific ratings
    const team1Ratings = [
      ratings[`${team1.defender}_defender`] || new Rating(DEFAULT_RATING, DEFAULT_DEVIATION),
      ratings[`${team1.attacker}_attacker`] || new Rating(DEFAULT_RATING, DEFAULT_DEVIATION)
    ];
    
    const team2Ratings = [
      ratings[`${team2.defender}_defender`] || new Rating(DEFAULT_RATING, DEFAULT_DEVIATION),
      ratings[`${team2.attacker}_attacker`] || new Rating(DEFAULT_RATING, DEFAULT_DEVIATION)
    ];

    // Calculate new ratings
    const ranks = winner === 1 ? [0, 1] : [1, 0];
    const [newTeam1Ratings, newTeam2Ratings] = ts.rate([team1Ratings, team2Ratings], ranks);

    // Update ratings in database with role-specific updates
    const updates = [
      [team1.defender, 'defender', newTeam1Ratings[0].mu, newTeam1Ratings[0].sigma],
      [team1.attacker, 'attacker', newTeam1Ratings[1].mu, newTeam1Ratings[1].sigma],
      [team2.defender, 'defender', newTeam2Ratings[0].mu, newTeam2Ratings[0].sigma],
      [team2.attacker, 'attacker', newTeam2Ratings[1].mu, newTeam2Ratings[1].sigma]
    ];

    for (const [name, role, rating, deviation] of updates) {
      const fieldPrefix = role === 'defender' ? 'defender' : 'attacker';
      await db.collection('players').updateOne(
        { name },
        { 
          $set: { 
            [`${fieldPrefix}_rating`]: rating,
            [`${fieldPrefix}_deviation`]: deviation
          }
        }
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
      team1_win_probability: calculateWinProbability(team1Ratings, team2Ratings),
      team2_win_probability: calculateWinProbability(team2Ratings, team1Ratings)
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

// Add this function at the top of the file, after the imports
function calculateWinProbability(team1Ratings, team2Ratings) {
  // Calculate team strengths (sum of ratings)
  const team1Strength = team1Ratings.reduce((sum, rating) => sum + rating.mu, 0);
  const team2Strength = team2Ratings.reduce((sum, rating) => sum + rating.mu, 0);
  
  // Calculate combined standard deviation
  const team1Deviation = Math.sqrt(team1Ratings.reduce((sum, rating) => sum + Math.pow(rating.sigma, 2), 0));
  const team2Deviation = Math.sqrt(team2Ratings.reduce((sum, rating) => sum + Math.pow(rating.sigma, 2), 0));
  const combinedDeviation = Math.sqrt(Math.pow(team1Deviation, 2) + Math.pow(team2Deviation, 2));
  
  // Calculate win probability using normal distribution
  const diff = team1Strength - team2Strength;
  const z = diff / combinedDeviation;
  return 0.5 * (1 + Math.erf(z / Math.sqrt(2)));
}

// Add this helper function for the error function
function erf(x) {
  // Approximation of the error function
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0/(1.0 + p*x);
  const y = 1.0 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);
  return sign * y;
}

// Add Math.erf if it doesn't exist
if (!Math.erf) {
  Math.erf = erf;
} 