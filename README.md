# Travian Clone

A browser-based MMORTS game inspired by classic Travian (2004-2008 era). Built with React, Node.js, PostgreSQL, and Redis.

## Features (Phase 1 - MVP)

- **User Authentication**: Register with tribe selection (Romans, Gauls, Teutons)
- **Village Management**: Resource fields and village center buildings
- **Resource System**: Real-time resource production (lumber, clay, iron, crop)
- **Construction Queue**: Build and upgrade buildings with real-time timers
- **Classic Aesthetics**: Earthy color palette inspired by original Travian

## Tech Stack

- **Frontend**: React 18 + TypeScript, Vite, Zustand, Socket.io-client
- **Backend**: Node.js + Express, TypeScript, Prisma ORM
- **Database**: PostgreSQL 16
- **Cache/Queue**: Redis 7
- **Real-time**: Socket.io

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose (for PostgreSQL and Redis)

### Setup

1. **Start the databases**:
   ```bash
   docker-compose up -d
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the shared package**:
   ```bash
   npm run build -w @travian/shared
   ```

4. **Generate Prisma client and push schema**:
   ```bash
   npm run db:generate
   npm run db:push
   ```

5. **Start development servers**:
   ```bash
   npm run dev
   ```

6. **Open the game**: http://localhost:5173

## Project Structure

```
travian-clone/
├── packages/
│   ├── frontend/        # React application
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── layouts/
│   │   │   ├── pages/
│   │   │   ├── services/
│   │   │   ├── stores/
│   │   │   └── styles/
│   │   └── package.json
│   ├── backend/         # Express API server
│   │   ├── src/
│   │   │   ├── jobs/
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   └── socket/
│   │   ├── prisma/
│   │   └── package.json
│   └── shared/          # Shared types and constants
│       ├── src/
│       └── package.json
├── docker-compose.yml
└── package.json
```

## Game Mechanics

### Resources
- **Lumber**: Produced by Woodcutters
- **Clay**: Produced by Clay Pits
- **Iron**: Produced by Iron Mines
- **Crop**: Produced by Croplands (also consumed by population and troops)

### Buildings
Resources are calculated on-demand, not via server ticks. This means:
- Resources accumulate based on time elapsed since last calculation
- No server-side polling required
- Accurate to the second

### Timer Speed
For development, timers run at **10x speed** (configurable in `packages/shared/src/constants.ts`).

## Development

### Available Scripts

```bash
# Start dev servers (frontend + backend)
npm run dev

# Start only backend
npm run dev:backend

# Start only frontend
npm run dev:frontend

# Build all packages
npm run build

# Database operations
npm run db:generate    # Generate Prisma client
npm run db:push        # Push schema to database
npm run db:studio      # Open Prisma Studio
```

### Environment Variables

Backend (`.env` in `packages/backend/`):
```env
DATABASE_URL="postgresql://travian:travian_dev@localhost:5432/travian"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-secret-key"
PORT=3001
```

## Roadmap

### Phase 1: Foundation (Current) ✅
- [x] Project scaffolding
- [x] User authentication
- [x] Village resource fields
- [x] Village center buildings
- [x] Construction timers
- [x] Resource calculation engine
- [x] Real-time updates via Socket.io

### Phase 2: Village Development
- [ ] Complete building tree
- [ ] Building prerequisites system
- [ ] Production bonuses

### Phase 3: Military & Combat
- [ ] Troop training
- [ ] Attack/raid system
- [ ] Battle reports

### Phase 4: World Map
- [ ] Map view with coordinates
- [ ] Village expansion
- [ ] Settlers

### Phase 5: Multiplayer
- [ ] Alliances
- [ ] Messaging
- [ ] Attack notifications

### Phase 6: Polish
- [ ] All three tribes
- [ ] Custom assets
- [ ] Balance tuning

## License

MIT
