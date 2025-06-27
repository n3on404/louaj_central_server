# Louaj Central Server

🚌 **Central Server for the Louaj Public Transportation Management System**

## 🎯 Overview

The Central Server is the heart of the Louaj system, managing global data, cross-station coordination, and real-time synchronization with local nodes across Tunisia.

## 🛠️ Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Security**: Helmet, CORS
- **Logging**: Morgan
- **Environment**: dotenv

## 📁 Project Structure

```
central-server/
├── src/
│   ├── index.ts              # Main server entry point
│   └── lib/
│       └── database.ts       # Database configuration
├── prisma/
│   ├── schema.prisma         # Database schema
│   └── seed.ts              # Database seeding
├── tsconfig.json            # TypeScript configuration
├── package.json             # Dependencies and scripts
└── env.example              # Environment variables template
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### 1. Environment Setup

Copy the environment example and configure your database:

```bash
cp env.example .env
```

Edit `.env` with your database credentials:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/louaj_central?schema=public"
PORT=5000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

Generate Prisma client:
```bash
npm run db:generate
```

Push schema to database (for development):
```bash
npm run db:push
```

Or create and run migrations (for production):
```bash
npm run db:migrate
```

### 4. Seed Database

Populate with initial data (governorates, stations, etc.):
```bash
npm run db:seed
```

### 5. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:5000`

## 📚 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build TypeScript to JavaScript |
| `npm run start` | Start production server |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema changes to database |
| `npm run db:migrate` | Create and run database migrations |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `npm run db:seed` | Seed database with initial data |

## 🌐 API Endpoints

### Health Check
- `GET /health` - Server and database health status

### API Info
- `GET /api/v1` - API information and available endpoints

### Planned Endpoints (TODO)
- `POST /api/v1/auth/login` - Staff authentication
- `GET /api/v1/stations` - List all stations
- `GET /api/v1/vehicles` - Vehicle management
- `POST /api/v1/bookings` - Booking operations
- `GET /api/v1/queue` - Queue management

## 🗄️ Database Schema

The central server uses a comprehensive PostgreSQL schema with the following main entities:

### Geographic Organization
- **Governorate** - Tunisia governorates (Tunis, Monastir, Sfax...)
- **Delegation** - Administrative subdivisions
- **Station** - Physical transport stations

### Operations
- **Staff** - Station workers and supervisors
- **Driver** & **Vehicle** - Transportation fleet
- **VehicleQueue** - Unified queue and booking system
- **Booking** - Customer reservations
- **Route** - Connections between stations

### System Management
- **SyncLog** - Synchronization tracking with local nodes
- **Payment** - Transaction records

## 🔒 Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin request protection
- **Input validation**: Request body validation
- **Error handling**: Comprehensive error responses
- **Graceful shutdown**: Clean database disconnection

## 🔄 Sync Integration

The central server coordinates with local nodes through:
- **WebSocket connections** for real-time updates
- **HTTP APIs** for data synchronization  
- **Conflict resolution** for offline operations
- **Heartbeat monitoring** for station status

## 📊 Database Seeding

The seed script creates initial data:
- 3 Governorates (Tunis, Monastir, Sfax)
- 3 Delegations and Stations
- Sample routes, drivers, vehicles
- Test staff accounts (Supervisor & Worker)

## 🚨 Error Handling

- Comprehensive error middleware
- Database connection monitoring
- Graceful shutdown on SIGINT/SIGTERM
- Development vs production error messages

## 📈 Next Steps

1. Implement authentication routes
2. Add station management endpoints
3. Build queue management APIs
4. Integrate WebSocket for real-time updates
5. Add booking and payment processing
6. Implement sync logic with local nodes

---

**🚌 Ready to modernize Tunisia's transportation system!** 