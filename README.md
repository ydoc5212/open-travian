# Open Travian

An open-source browser-based strategy game inspired by classic Travian (2004-2008 era). Built with React, Node.js, and PostgreSQL with accurate game mechanics based on original Travian formulas.

## Features

### Tribes & Units
- **Romans**: Legionnaire, Praetorian, Imperian, Equites Legati, Equites Imperatoris, Equites Caesaris, Ram, Catapult, Senator, Settler
- **Gauls**: Phalanx, Swordsman, Pathfinder, Theutates Thunder, Druidrider, Haeduan, Ram, Catapult, Chieftain, Settler
- **Teutons**: Clubswinger, Spearman, Axeman, Scout, Paladin, Teutonic Knight, Ram, Catapult, Chief, Settler

### Combat System
- Accurate Travian combat formulas
- Infantry vs cavalry defense calculations
- Tribe-specific wall bonuses (Romans 3%, Gauls 2.5%, Teutons 2% per level)
- Morale system based on population ratio
- Raid vs attack modes
- Battle reports

### Village Management
- 18 resource fields (4-4-4-6 distribution)
- 22 building slots in village center
- Real-time resource production
- Construction queue with timers
- Warehouse and granary capacity

### Buildings
- Main Building, Warehouse, Granary, Marketplace, Embassy
- Barracks, Stable, Workshop, Academy, Smithy
- Rally Point, Wall, Cranny, Residence/Palace
- Tribe-specific: Horse Drinking Trough (Romans), Trapper (Gauls), Brewery (Teutons)

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Zustand, Socket.io-client
- **Backend**: Node.js, Express, TypeScript, Prisma ORM
- **Database**: PostgreSQL
- **Real-time**: Socket.io

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose (for PostgreSQL)

### Setup

```bash
# Start PostgreSQL
docker-compose up -d

# Install dependencies
npm install

# Build shared package
npm run build

# Setup database
npm run db:generate
npm run db:push

# Start dev servers
npm run dev
```

Open http://localhost:5173 and use the **Quick Demo** button for instant access.

## Project Structure

```
open-travian/
├── packages/
│   ├── frontend/          # React application
│   │   ├── src/
│   │   │   ├── components/  # Reusable UI components
│   │   │   ├── layouts/     # Page layouts
│   │   │   ├── pages/       # Route pages
│   │   │   ├── services/    # API & socket clients
│   │   │   ├── stores/      # Zustand state stores
│   │   │   └── styles/      # Global CSS
│   │   └── public/assets/   # Images (units, buildings)
│   ├── backend/           # Express API server
│   │   ├── src/
│   │   │   ├── jobs/        # Background job processor
│   │   │   ├── middleware/  # Auth middleware
│   │   │   ├── routes/      # API routes
│   │   │   ├── services/    # Business logic
│   │   │   └── socket/      # Socket.io handlers
│   │   └── prisma/          # Database schema
│   └── shared/            # Shared types & game constants
│       └── src/
│           ├── types.ts     # TypeScript types
│           └── constants.ts # Game data & formulas
├── docker-compose.yml
└── package.json
```

## Game Mechanics

### Resources
Resources are calculated on-demand based on elapsed time:
- **Lumber**: Produced by Woodcutters
- **Clay**: Produced by Clay Pits
- **Iron**: Produced by Iron Mines
- **Crop**: Produced by Croplands (consumed by population & troops)

### Production Formula
Uses accurate Travian lookup table per level:
```
Level:  1   2   3   4   5   6   7   8   9   10  ...
Prod:   5   9  15  22  33  50  70 100 145 200  ...
```

### Combat Formula
- Offense = sum(unit_attack × quantity) × morale
- Defense = sum(weighted_defense × quantity) × wall_bonus
- Weighted defense based on attacker infantry/cavalry ratio
- Losses calculated using `(weaker/stronger)^1.5` formula

### Speed Multiplier
Development mode runs at **100x speed** (configurable in `constants.ts`).

## Development

### Scripts

```bash
npm run dev           # Start frontend + backend
npm run dev:backend   # Backend only
npm run dev:frontend  # Frontend only
npm run build         # Build all packages

# Database
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to database
npm run db:studio     # Open Prisma Studio
```

### Environment Variables

Create `.env` in `packages/backend/`:
```env
DATABASE_URL="postgresql://travian:travian_dev@localhost:5432/travian"
JWT_SECRET="your-secret-key"
PORT=3001
```

## Roadmap

- [x] User authentication with tribe selection
- [x] Village resource fields & buildings
- [x] Real-time resource production
- [x] Construction queue with timers
- [x] All 30 units for 3 tribes
- [x] Troop training system
- [x] Combat system with accurate formulas
- [x] Battle reports
- [x] Rally point for attacks/raids
- [ ] World map view
- [ ] Village expansion (settlers)
- [ ] Alliances
- [ ] Messaging system
- [ ] Hero system

## Credits

- Game mechanics based on original Travian by Travian Games GmbH
- Unit sprites from TravianZ open-source project

## License

MIT
