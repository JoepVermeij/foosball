# Foosball Rating System

A web application for tracking foosball matches and player ratings using the TrueSkill algorithm.

## Features

- Player management (add, view, filter by position)
- Match recording
- Automatic rating updates using TrueSkill
- Leaderboard display
- Rating reset functionality

## Tech Stack

- Frontend: HTML, Tailwind CSS
- Backend: Node.js, Express
- Database: MongoDB Atlas
- Rating System: TrueSkill algorithm

## Setup

### Prerequisites

- Node.js (v14 or higher)
- MongoDB Atlas account

### Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd foosball-rating
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
   - Create a `.env` file in the root directory:
   ```
   MONGODB_URI=your_mongodb_connection_string
   MONGODB_DB=foosball
   PORT=3000
   ```

4. Start the development server:
```bash
npm run dev
```

### MongoDB Setup

1. Create a MongoDB Atlas account at https://www.mongodb.com/cloud/atlas
2. Create a new cluster (free tier is sufficient)
3. Create a database user with read/write permissions
4. Get your connection string from MongoDB Atlas
5. Add your IP address to the Network Access whitelist
6. The application will automatically create the required collections:
   - `players`: Stores player information and ratings
   - `matches`: Stores match history

## Project Structure

```
.
├── public/              # Static frontend files
│   ├── index.html      # Leaderboard page
│   ├── match.html      # Match recording page
│   └── users.html      # Player management page
├── utils/              # Utility functions
│   └── mongodb.js      # MongoDB connection utility
├── server.js           # Main Express server
├── .env               # Environment variables
├── package.json       # Project dependencies
└── README.md         # Project documentation
```

## API Endpoints

- `GET /api/players` - Get all players
- `GET /api/players/:position` - Get players by position
- `POST /api/players` - Add a new player
- `POST /api/players/reset-ratings` - Reset all player ratings
- `POST /api/match` - Record a new match

## Development

The application uses:
- `nodemon` for automatic server restart during development
- CORS enabled for all origins in development
- MongoDB connection pooling for better performance
- Error handling middleware for consistent error responses

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 