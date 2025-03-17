import express from 'express';
import serverless from 'serverless-http';
import sqlite3 from 'sqlite3';
import { Rating, TrueSkill } from 'ts-trueskill';

const app = express();

// Initialize TrueSkill
const ts = new TrueSkill();

// Default rating values
const DEFAULT_RATING = 25.0;
const DEFAULT_DEVIATION = 8.333;

// Middleware
app.use(express.json());

// For development purposes, use SQLite
// Note: For production on Netlify, you should use a proper database service
// like FaunaDB, MongoDB Atlas, etc., as Netlify's serverless functions
// can't persist SQLite databases between function invocations
let db;
try {
  db = new sqlite3.Database('/tmp/foosball.db', (err) => {
    if (err) {
      console.error('Error opening database:', err);
      return;
    }
    console.log('Connected to SQLite database');
    
    // Create tables if they don't exist
    db.run(`CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      position TEXT DEFAULT 'any',
      rating REAL DEFAULT 25.0,
      rating_deviation REAL DEFAULT 8.333
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team1_defender TEXT,
      team1_attacker TEXT,
      team2_defender TEXT,
      team2_attacker TEXT,
      winner INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  });
} catch (error) {
  console.error('Database connection error:', error);
}

// API endpoints
app.get('/api/players', (req, res) => {
  db.all('SELECT * FROM players ORDER BY rating DESC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Get players by position
app.get('/api/players/:position', (req, res) => {
  const position = req.params.position;
  if (!['defender', 'attacker', 'any'].includes(position)) {
    return res.status(400).json({ error: 'Invalid position. Must be defender, attacker, or any' });
  }
  
  const query = position === 'any' 
    ? 'SELECT * FROM players ORDER BY rating DESC' 
    : 'SELECT * FROM players WHERE position = ? OR position = "any" ORDER BY rating DESC';
  
  db.all(query, position === 'any' ? [] : [position], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Add a new player
app.post('/api/players', (req, res) => {
  const { name, position = 'any' } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Player name is required' });
  }
  
  if (!['defender', 'attacker', 'any'].includes(position)) {
    return res.status(400).json({ error: 'Invalid position. Must be defender, attacker, or any' });
  }
  
  db.run(
    'INSERT INTO players (name, position, rating, rating_deviation) VALUES (?, ?, ?, ?)',
    [name.trim(), position, DEFAULT_RATING, DEFAULT_DEVIATION],
    function(err) {
      if (err) {
        // Check for duplicate name (SQLITE_CONSTRAINT_UNIQUE error)
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'A player with this name already exists' });
        }
        return res.status(500).json({ error: err.message });
      }
      
      res.status(201).json({ 
        id: this.lastID,
        name: name.trim(),
        position,
        rating: DEFAULT_RATING,
        rating_deviation: DEFAULT_DEVIATION
      });
    }
  );
});

// Reset all player ratings to default values
app.post('/api/players/reset-ratings', async (req, res) => {
  try {
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE players SET rating = ?, rating_deviation = ?',
        [DEFAULT_RATING, DEFAULT_DEVIATION],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
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
  
  try {
    // Get all players involved in the match
    const playerNames = [team1.defender, team1.attacker, team2.defender, team2.attacker];
    
    // Get current ratings for all players
    const players = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM players WHERE name IN (?, ?, ?, ?)',
        playerNames,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
    });

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
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT OR REPLACE INTO players (name, rating, rating_deviation) VALUES (?, ?, ?)',
          [name, rating, deviation],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    // Record the match
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO matches (team1_defender, team1_attacker, team2_defender, team2_attacker, winner) VALUES (?, ?, ?, ?, ?)',
        [team1.defender, team1.attacker, team2.defender, team2.attacker, winner],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing match:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export the serverless handler
export const handler = serverless(app);