# Foosball TrueSkill Rating System

A web application for tracking and calculating foosball player ratings using the TrueSkill™ algorithm. This system allows you to record matches, track player performance, and maintain a leaderboard with position-specific rankings (defenders and attackers).

## Features

- **Position-based Player Management**: Players can be assigned specific positions (defender, attacker, or flexible)
- **Match Recording**: Record match results with position-specific team composition
- **TrueSkill Rating Algorithm**: Uses Microsoft's TrueSkill algorithm for accurate skill estimation
- **Leaderboard**: View player rankings with filtering options by position
- **Rating Reset**: Reset all player ratings to default values when needed
- **MongoDB Integration**: Persistent data storage with MongoDB Atlas support

## Installation

### Prerequisites

1. Node.js (v14 or higher)
2. MongoDB (for local development)
3. MongoDB Atlas account (for production deployment)

### Local Setup

1. Clone the repository:
   ```
   git clone <repository-url>
   cd trueskill
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up MongoDB:
   - Install MongoDB locally, or
   - Use Docker to run MongoDB:
     ```
     docker run -d -p 27017:27017 --name mongodb mongo:latest
     ```

4. Configure environment variables:
   - Copy `.env.sample` to `.env`
   - Update the MongoDB connection string in `.env`:
     ```
     MONGODB_URI=mongodb://localhost:27017/foosball
     ```

5. Start the server:
   ```
   npm start
   ```

6. Access the application at http://localhost:3000

### Local Development with Netlify Integration

If you want to run the server locally while connecting to your Netlify deployed site:

1. Install the Netlify CLI:
   ```
   npm install -g netlify-cli
   ```

2. Link your local project to your Netlify site:
   ```
   netlify link
   ```

3. Start the local development server with Netlify integration:
   ```
   netlify dev
   ```

4. This will typically run on http://localhost:8888 and will:
   - Run your local Express server
   - Proxy API requests to your Netlify functions or local server
   - Provide the same environment as your Netlify deployment

### Netlify Deployment

This application can be deployed to Netlify as a serverless application:

1. Install Netlify CLI:
   ```
   npm install -g netlify-cli
   ```

2. Login to Netlify:
   ```
   netlify login
   ```

3. Set up MongoDB Atlas:
   - Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create a database user with appropriate permissions
   - Get your connection string from the "Connect" button
   - Add the connection string to your Netlify environment variables as `MONGODB_URI_PRODUCTION`

4. Deploy to Netlify:
   ```
   netlify deploy --prod
   ```

## Usage Guide

### Managing Players

1. Navigate to the "Manage Players" page by clicking the link in the navbar
2. Add a new player:
   - Enter the player's name
   - Select a position: 
     - **Defender** - Players who primarily play defense
     - **Attacker** - Players who primarily play offense
     - **Any Position** - Flexible players who can play both roles
   - Click "Add Player"
3. View existing players:
   - Filter players by position using the dropdown menu
   - View current ratings for all players

### Recording Matches

1. Navigate to the "Record New Match" page
2. Create teams with defined positions:
   - Select a defender and attacker for Team 1
   - Select a defender and attacker for Team 2
   - Each player can only be selected once
3. Select the winning team
4. Submit the match to update player ratings

### Viewing the Leaderboard

1. The main page displays the leaderboard with player rankings
2. Filter the leaderboard by position using the dropdown menu
3. Players are ranked by their TrueSkill rating (higher is better)
4. The leaderboard automatically refreshes every 30 seconds

### Resetting Ratings

1. Navigate to the "Manage Players" page
2. Click the "Reset All Ratings" button
3. Confirm the reset action in the popup dialog
4. All players will be reset to the default rating (25.0) and rating deviation (8.333)

## Technology Stack

- **Frontend**: HTML, JavaScript, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: MongoDB (local development) / MongoDB Atlas (production)
- **Algorithm**: TrueSkill (ts-trueskill package)
- **Deployment**: Netlify (optional)

## Project Structure

```
trueskill/
├── public/              # Static frontend files
│   ├── index.html       # Leaderboard page
│   ├── match.html       # Match recording page
│   └── users.html       # User management page
├── netlify/             # Netlify serverless functions
│   └── functions/
│       └── api.js       # API endpoints for Netlify deployment
├── server.js            # Main Express server (for local development)
├── .env                 # Environment configuration
├── .env.sample          # Sample environment configuration
├── .gitignore           # Git ignore file
├── netlify.toml         # Netlify configuration
├── package.json         # Node.js dependencies
└── README.md            # Project documentation
```

## Environment Configuration

The application uses environment variables for configuration. Create a `.env` file based on `.env.sample`:

```env
# Server Settings
PORT=3000

# MongoDB Settings
MONGODB_URI=mongodb://localhost:27017/foosball
MONGODB_URI_PRODUCTION=your_mongodb_atlas_connection_string

# Deployment Settings
IS_NETLIFY=false
USE_NETLIFY_API=false
NETLIFY_SITE_URL=your_netlify_site_url
```

## Troubleshooting

- **MongoDB Connection Issues**:
  - Ensure MongoDB is running locally or your Atlas cluster is accessible
  - Check your connection string format and credentials
  - Verify network connectivity and firewall settings

- **Port already in use**: If port 3000 is already in use, change the port number in `.env` or kill the existing process
  ```
  # Find process using port 3000
  lsof -i :3000
  # Kill the process
  kill -9 <PID>
  ```

- **Netlify deployment errors**: 
  - Check the error logs in the Netlify console
  - Make sure all dependencies are correctly specified in `package.json`
  - Verify your MongoDB Atlas connection string is set in Netlify environment variables

- **Changes not showing up**: 
  - Clear your browser cache
  - Make sure the server is restarted after making code changes

- **Local server not connecting to Netlify**:
  - Make sure you've linked your project using `netlify link`
  - Check that your `netlify.toml` file has the correct port and redirect configurations
  - Run with `netlify dev --debug` to see detailed logs

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](LICENSE) 