import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Oasis types with their probabilities
const OASIS_TYPES = [
  'lumber25',
  'lumber50',
  'clay25',
  'clay50',
  'iron25',
  'iron50',
  'crop25',
  'crop50',
];

/**
 * Seed the database with oases distributed across the map
 * Generates oases in a 400x400 grid centered at (0,0)
 */
async function seedOases() {
  try {
    console.log('Starting oasis seeding...');

    // Clear existing oases
    await prisma.oasis.deleteMany({});
    console.log('Cleared existing oases');

    const oasesToCreate = [];
    const mapSize = 200; // -200 to +200 on both axes

    // Generate oases with ~5% distribution across the map
    for (let x = -mapSize; x <= mapSize; x++) {
      for (let y = -mapSize; y <= mapSize; y++) {
        // Use coordinate-based hash for consistent but random-looking distribution
        const hash = Math.abs((x * 4561 + y * 4567) % 100);

        // Skip if not an oasis location (95% of tiles)
        if (hash >= 5) continue;

        // Skip if there's already a village at this location
        const existingVillage = await prisma.village.findUnique({
          where: {
            xCoord_yCoord: {
              xCoord: x,
              yCoord: y,
            },
          },
        });
        if (existingVillage) continue;

        // Determine oasis type based on location
        const typeHash = Math.abs((x * 7919 + y * 7907) % 100);
        let oasisType: string;

        if (typeHash < 12) {
          oasisType = 'lumber25';
        } else if (typeHash < 15) {
          oasisType = 'lumber50';
        } else if (typeHash < 27) {
          oasisType = 'clay25';
        } else if (typeHash < 30) {
          oasisType = 'clay50';
        } else if (typeHash < 42) {
          oasisType = 'iron25';
        } else if (typeHash < 45) {
          oasisType = 'iron50';
        } else if (typeHash < 90) {
          oasisType = 'crop25';
        } else {
          oasisType = 'crop50';
        }

        oasesToCreate.push({
          xCoord: x,
          yCoord: y,
          type: oasisType,
          ownerId: null,
          conqueredAt: null,
        });
      }
    }

    // Batch create oases for better performance
    console.log(`Creating ${oasesToCreate.length} oases...`);

    // Create in chunks to avoid memory issues
    const chunkSize = 100;
    for (let i = 0; i < oasesToCreate.length; i += chunkSize) {
      const chunk = oasesToCreate.slice(i, i + chunkSize);
      await prisma.oasis.createMany({
        data: chunk,
      });
      console.log(`Created oases ${i + 1} to ${Math.min(i + chunkSize, oasesToCreate.length)}`);
    }

    console.log(`Successfully seeded ${oasesToCreate.length} oases!`);

    // Show distribution stats
    const typeCounts: Record<string, number> = {};
    for (const oasis of oasesToCreate) {
      typeCounts[oasis.type] = (typeCounts[oasis.type] || 0) + 1;
    }

    console.log('\nOasis distribution:');
    for (const [type, count] of Object.entries(typeCounts)) {
      console.log(`  ${type}: ${count}`);
    }
  } catch (error) {
    console.error('Error seeding oases:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedOases()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
