import express from 'express';
import sqlite3 from 'sqlite3';
import { Rating, TrueSkill } from 'ts-trueskill';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Initialize TrueSkill
const ts = new TrueSkill();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('foosball.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Connected to SQLite database');
  
  // Create tables if they don't exist
  db.run(`CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    rating REAL DEFAULT 25.0,
    rating_deviation REAL DEFAULT 8.333
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team1_player1 TEXT,
    team1_player2 TEXT,
    team2_player1 TEXT,
    team2_player2 TEXT,
    winner INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
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

// Add a new player
app.post('/api/players', (req, res) => {
  const { name } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Player name is required' });
  }

  // Default rating values from TrueSkill
  const defaultRating = 25.0;
  const defaultDeviation = 8.333;
  
  db.run(
    'INSERT INTO players (name, rating, rating_deviation) VALUES (?, ?, ?)',
    [name.trim(), defaultRating, defaultDeviation],
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
        rating: defaultRating,
        rating_deviation: defaultDeviation
      });
    }
  );
});

app.post('/api/match', async (req, res) => {
  const { team1, team2, winner } = req.body;
  
  try {
    // Get current ratings for all players
    const players = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM players WHERE name IN (?, ?, ?, ?)',
        [...team1, ...team2],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
    });

    // Create rating objects for TrueSkill
    const ratings = {};
    players.forEach(player => {
      ratings[player.name] = new Rating(player.rating || 25.0, player.rating_deviation || 8.333);
    });

    // Create teams
    const team1Ratings = team1.map(player => ratings[player] || new Rating(25.0, 8.333));
    const team2Ratings = team2.map(player => ratings[player] || new Rating(25.0, 8.333));

    // Calculate new ratings
    const ranks = winner === 1 ? [0, 1] : [1, 0];
    const [newTeam1Ratings, newTeam2Ratings] = ts.rate([team1Ratings, team2Ratings], ranks);

    // Update ratings in database
    const updates = [
      ...team1.map((name, i) => [name, newTeam1Ratings[i].mu, newTeam1Ratings[i].sigma]),
      ...team2.map((name, i) => [name, newTeam2Ratings[i].mu, newTeam2Ratings[i].sigma])
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
        'INSERT INTO matches (team1_player1, team1_player2, team2_player1, team2_player2, winner) VALUES (?, ?, ?, ?, ?)',
        [...team1, ...team2, winner],
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 