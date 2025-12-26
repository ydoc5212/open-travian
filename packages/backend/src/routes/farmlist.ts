import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { checkGoldClub } from './gold';

const router = Router();

// Get all farm lists for user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const hasGoldClub = await checkGoldClub(req.userId!);
    if (!hasGoldClub) {
      return res.status(403).json({ success: false, error: 'Gold Club required for farm lists' });
    }

    const farmLists = await prisma.farmList.findMany({
      where: { userId: req.userId },
      include: { entries: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: farmLists,
    });
  } catch (error) {
    console.error('Error fetching farm lists:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch farm lists' });
  }
});

// Create new farm list
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Farm list name is required' });
    }

    const hasGoldClub = await checkGoldClub(req.userId!);
    if (!hasGoldClub) {
      return res.status(403).json({ success: false, error: 'Gold Club required for farm lists' });
    }

    const farmList = await prisma.farmList.create({
      data: {
        userId: req.userId!,
        name: name.trim(),
      },
      include: { entries: true },
    });

    res.json({
      success: true,
      data: farmList,
    });
  } catch (error) {
    console.error('Error creating farm list:', error);
    res.status(500).json({ success: false, error: 'Failed to create farm list' });
  }
});

// Update farm list name
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Farm list name is required' });
    }

    // Verify ownership
    const farmList = await prisma.farmList.findFirst({
      where: { id, userId: req.userId },
    });

    if (!farmList) {
      return res.status(404).json({ success: false, error: 'Farm list not found' });
    }

    const updated = await prisma.farmList.update({
      where: { id },
      data: { name: name.trim() },
      include: { entries: true },
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Error updating farm list:', error);
    res.status(500).json({ success: false, error: 'Failed to update farm list' });
  }
});

// Delete farm list
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const farmList = await prisma.farmList.findFirst({
      where: { id, userId: req.userId },
    });

    if (!farmList) {
      return res.status(404).json({ success: false, error: 'Farm list not found' });
    }

    await prisma.farmList.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting farm list:', error);
    res.status(500).json({ success: false, error: 'Failed to delete farm list' });
  }
});

// Add entry to farm list
router.post('/:id/entries', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { xCoord, yCoord, troops, attackType } = req.body;

    // Verify ownership
    const farmList = await prisma.farmList.findFirst({
      where: { id, userId: req.userId },
    });

    if (!farmList) {
      return res.status(404).json({ success: false, error: 'Farm list not found' });
    }

    // Validate coordinates
    if (typeof xCoord !== 'number' || typeof yCoord !== 'number') {
      return res.status(400).json({ success: false, error: 'Invalid coordinates' });
    }

    // Validate troops
    if (!troops || typeof troops !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid troops configuration' });
    }

    // Validate attack type
    if (!['raid', 'attack'].includes(attackType)) {
      return res.status(400).json({ success: false, error: 'Invalid attack type' });
    }

    // Find target village (if it exists)
    const targetVillage = await prisma.village.findUnique({
      where: { xCoord_yCoord: { xCoord, yCoord } },
    });

    const entry = await prisma.farmListEntry.create({
      data: {
        farmListId: id,
        targetVillageId: targetVillage?.id || null,
        xCoord,
        yCoord,
        troops: JSON.stringify(troops),
        attackType,
      },
    });

    res.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    console.error('Error adding farm list entry:', error);
    res.status(500).json({ success: false, error: 'Failed to add farm list entry' });
  }
});

// Update farm list entry
router.patch('/:id/entries/:entryId', async (req: AuthRequest, res: Response) => {
  try {
    const { id, entryId } = req.params;
    const { troops, attackType } = req.body;

    // Verify ownership
    const farmList = await prisma.farmList.findFirst({
      where: { id, userId: req.userId },
    });

    if (!farmList) {
      return res.status(404).json({ success: false, error: 'Farm list not found' });
    }

    // Verify entry belongs to this farm list
    const entry = await prisma.farmListEntry.findFirst({
      where: { id: entryId, farmListId: id },
    });

    if (!entry) {
      return res.status(404).json({ success: false, error: 'Farm list entry not found' });
    }

    const updateData: any = {};
    if (troops) {
      updateData.troops = JSON.stringify(troops);
    }
    if (attackType && ['raid', 'attack'].includes(attackType)) {
      updateData.attackType = attackType;
    }

    const updated = await prisma.farmListEntry.update({
      where: { id: entryId },
      data: updateData,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Error updating farm list entry:', error);
    res.status(500).json({ success: false, error: 'Failed to update farm list entry' });
  }
});

// Remove entry from farm list
router.delete('/:id/entries/:entryId', async (req: AuthRequest, res: Response) => {
  try {
    const { id, entryId } = req.params;

    // Verify ownership
    const farmList = await prisma.farmList.findFirst({
      where: { id, userId: req.userId },
    });

    if (!farmList) {
      return res.status(404).json({ success: false, error: 'Farm list not found' });
    }

    // Verify entry belongs to this farm list
    const entry = await prisma.farmListEntry.findFirst({
      where: { id: entryId, farmListId: id },
    });

    if (!entry) {
      return res.status(404).json({ success: false, error: 'Farm list entry not found' });
    }

    await prisma.farmListEntry.delete({ where: { id: entryId } });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting farm list entry:', error);
    res.status(500).json({ success: false, error: 'Failed to delete farm list entry' });
  }
});

// Execute farm list - send all attacks
router.post('/:id/execute', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { fromVillageId } = req.body;

    if (!fromVillageId) {
      return res.status(400).json({ success: false, error: 'Source village required' });
    }

    // Verify ownership of farm list
    const farmList = await prisma.farmList.findFirst({
      where: { id, userId: req.userId },
      include: { entries: true },
    });

    if (!farmList) {
      return res.status(404).json({ success: false, error: 'Farm list not found' });
    }

    // Verify ownership of source village
    const sourceVillage = await prisma.village.findFirst({
      where: { id: fromVillageId, userId: req.userId },
      include: { troops: { where: { status: 'home' } } },
    });

    if (!sourceVillage) {
      return res.status(404).json({ success: false, error: 'Source village not found' });
    }

    const launchedAttacks: any[] = [];
    const errors: any[] = [];

    // Launch attacks for each entry
    for (const entry of farmList.entries) {
      try {
        const troopConfig = JSON.parse(entry.troops);

        // Verify we have enough troops
        const troopsToSend: any[] = [];
        for (const [unitType, quantity] of Object.entries(troopConfig)) {
          if (typeof quantity !== 'number' || quantity <= 0) continue;

          const troop = sourceVillage.troops.find((t) => t.unitType === unitType && t.status === 'home');
          if (!troop || troop.quantity < quantity) {
            errors.push({
              xCoord: entry.xCoord,
              yCoord: entry.yCoord,
              error: `Not enough ${unitType}`,
            });
            continue;
          }

          troopsToSend.push({ unitType, quantity });
        }

        if (troopsToSend.length === 0) {
          errors.push({
            xCoord: entry.xCoord,
            yCoord: entry.yCoord,
            error: 'No valid troops to send',
          });
          continue;
        }

        // Calculate travel time (simplified - should use actual unit speeds)
        const distance = Math.sqrt(
          Math.pow(entry.xCoord - sourceVillage.xCoord, 2) + Math.pow(entry.yCoord - sourceVillage.yCoord, 2)
        );
        const travelTime = Math.ceil(distance * 60); // 1 minute per tile (simplified)

        const now = new Date();
        const arrivesAt = new Date(now.getTime() + travelTime * 1000);

        // Find or create target village
        let targetVillage = entry.targetVillageId
          ? await prisma.village.findUnique({ where: { id: entry.targetVillageId } })
          : null;

        if (!targetVillage) {
          targetVillage = await prisma.village.findUnique({
            where: { xCoord_yCoord: { xCoord: entry.xCoord, yCoord: entry.yCoord } },
          });
        }

        if (!targetVillage) {
          errors.push({
            xCoord: entry.xCoord,
            yCoord: entry.yCoord,
            error: 'Target village not found',
          });
          continue;
        }

        // Create attack
        const attack = await prisma.attack.create({
          data: {
            attackerVillageId: fromVillageId,
            defenderVillageId: targetVillage.id,
            attackType: entry.attackType,
            troops: JSON.stringify(troopsToSend),
            arrivesAt,
          },
        });

        // Update troop status
        for (const { unitType, quantity } of troopsToSend) {
          const troop = await prisma.troop.findFirst({
            where: { villageId: fromVillageId, unitType, status: 'home' },
          });

          if (troop) {
            if (troop.quantity === quantity) {
              await prisma.troop.update({
                where: { id: troop.id },
                data: { status: 'attacking', destinationVillageId: targetVillage.id, arrivesAt },
              });
            } else {
              await prisma.troop.update({
                where: { id: troop.id },
                data: { quantity: { decrement: quantity } },
              });

              await prisma.troop.create({
                data: {
                  villageId: fromVillageId,
                  unitType,
                  quantity,
                  status: 'attacking',
                  destinationVillageId: targetVillage.id,
                  arrivesAt,
                },
              });
            }
          }
        }

        // Schedule attack resolution
        await prisma.gameJob.create({
          data: {
            type: 'attack_resolve',
            villageId: targetVillage.id,
            data: JSON.stringify({ attackId: attack.id }),
            scheduledFor: arrivesAt,
          },
        });

        launchedAttacks.push({
          xCoord: entry.xCoord,
          yCoord: entry.yCoord,
          arrivesAt: arrivesAt.toISOString(),
        });
      } catch (entryError) {
        console.error('Error processing farm list entry:', entryError);
        errors.push({
          xCoord: entry.xCoord,
          yCoord: entry.yCoord,
          error: 'Failed to launch attack',
        });
      }
    }

    res.json({
      success: true,
      data: {
        launched: launchedAttacks.length,
        errors: errors.length,
        details: {
          launchedAttacks,
          errors,
        },
      },
    });
  } catch (error) {
    console.error('Error executing farm list:', error);
    res.status(500).json({ success: false, error: 'Failed to execute farm list' });
  }
});

export { router as farmListRouter };
