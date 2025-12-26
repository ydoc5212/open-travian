import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { hasEnoughResources, deductResources, addResources } from '../services/resources';

const router = Router();

// Merchant capacity per tribe (resources per merchant)
const MERCHANT_CAPACITY: Record<string, number> = {
  romans: 500,
  gauls: 750,
  teutons: 1000,
};

// Merchant speed per tribe (fields per hour) - Romans are fastest
const MERCHANT_SPEED: Record<string, number> = {
  romans: 20, // Fastest merchants
  gauls: 16,  // Medium speed
  teutons: 12, // Slowest merchants
};

// NPC trader exchange rates (gold cost per 100 resources)
const NPC_GOLD_COST_PER_100 = 1; // 1 gold per 100 resources traded

// Calculate merchant capacity including Trade Office bonus (20% per level)
async function calculateMerchantCapacity(villageId: string, baseTribe: string): Promise<number> {
  const baseCapacity = MERCHANT_CAPACITY[baseTribe] || 500;

  // Find Trade Office building
  const tradeOffice = await prisma.building.findFirst({
    where: {
      villageId,
      type: 'trade_office',
    },
  });

  if (!tradeOffice || tradeOffice.level === 0) {
    return baseCapacity;
  }

  // Add 20% per Trade Office level
  const bonus = 1 + (tradeOffice.level * 0.2);
  return Math.floor(baseCapacity * bonus);
}

// Calculate travel time between villages with tribe-specific speed
function calculateTravelTime(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  tribe: string
): number {
  const distance = Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2));
  const speed = MERCHANT_SPEED[tribe] || 16; // Default to Gaul speed
  // Time = distance / speed * 3600 seconds (per hour)
  return Math.ceil((distance / speed) * 3600);
}

// Calculate merchants needed
async function calculateMerchantsNeeded(
  villageId: string,
  totalResources: number,
  tribe: string
): Promise<number> {
  const capacity = await calculateMerchantCapacity(villageId, tribe);
  return Math.ceil(totalResources / capacity);
}

// GET /api/marketplace/offers - List available trade offers
router.get('/offers', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.query;

    if (!villageId || typeof villageId !== 'string') {
      return res.status(400).json({ success: false, error: 'Village ID required' });
    }

    // Verify user owns this village
    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Get active offers (not expired, not from same village)
    const now = new Date();
    const offers = await prisma.marketOffer.findMany({
      where: {
        expiresAt: { gt: now },
        villageId: { not: villageId },
      },
      include: {
        village: {
          select: {
            id: true,
            name: true,
            xCoord: true,
            yCoord: true,
            user: {
              select: {
                username: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedOffers = offers.map((offer) => ({
      id: offer.id,
      village: {
        id: offer.village.id,
        name: offer.village.name,
        coordinates: { x: offer.village.xCoord, y: offer.village.yCoord },
        owner: offer.village.user.username,
      },
      offering: {
        type: offer.offerType,
        amount: offer.offerAmount,
      },
      wanting: {
        type: offer.wantType,
        amount: offer.wantAmount,
      },
      createdAt: offer.createdAt,
      expiresAt: offer.expiresAt,
    }));

    res.json({ success: true, data: { offers: formattedOffers } });
  } catch (error) {
    console.error('Error fetching marketplace offers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch offers' });
  }
});

// GET /api/marketplace/my-offers - Get user's own offers
router.get('/my-offers', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.query;

    if (!villageId || typeof villageId !== 'string') {
      return res.status(400).json({ success: false, error: 'Village ID required' });
    }

    // Verify user owns this village
    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    const now = new Date();
    const offers = await prisma.marketOffer.findMany({
      where: {
        villageId,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedOffers = offers.map((offer) => ({
      id: offer.id,
      offering: {
        type: offer.offerType,
        amount: offer.offerAmount,
      },
      wanting: {
        type: offer.wantType,
        amount: offer.wantAmount,
      },
      createdAt: offer.createdAt,
      expiresAt: offer.expiresAt,
    }));

    res.json({ success: true, data: { offers: formattedOffers } });
  } catch (error) {
    console.error('Error fetching own offers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch offers' });
  }
});

// POST /api/marketplace/offer - Create a new offer
router.post('/offer', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId, offerType, offerAmount, wantType, wantAmount } = req.body;

    if (!villageId || !offerType || !offerAmount || !wantType || !wantAmount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (offerAmount < 1 || wantAmount < 1) {
      return res.status(400).json({ success: false, error: 'Amounts must be positive' });
    }

    if (offerType === wantType) {
      return res.status(400).json({ success: false, error: 'Cannot trade same resource type' });
    }

    const validTypes = ['lumber', 'clay', 'iron', 'crop'];
    if (!validTypes.includes(offerType) || !validTypes.includes(wantType)) {
      return res.status(400).json({ success: false, error: 'Invalid resource type' });
    }

    // Verify user owns this village
    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Check if user has enough resources
    const resourceToDeduct = {
      lumber: offerType === 'lumber' ? offerAmount : 0,
      clay: offerType === 'clay' ? offerAmount : 0,
      iron: offerType === 'iron' ? offerAmount : 0,
      crop: offerType === 'crop' ? offerAmount : 0,
    };

    const { hasEnough, current } = await hasEnoughResources(villageId, resourceToDeduct);
    if (!hasEnough) {
      return res.status(400).json({
        success: false,
        error: 'Not enough resources',
        data: { required: resourceToDeduct, current },
      });
    }

    // Deduct resources immediately (they're locked in the offer)
    await deductResources(villageId, resourceToDeduct);

    // Create offer (expires in 24 hours)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const offer = await prisma.marketOffer.create({
      data: {
        villageId,
        offerType,
        offerAmount,
        wantType,
        wantAmount,
        expiresAt,
      },
    });

    res.json({
      success: true,
      data: {
        offer: {
          id: offer.id,
          offering: { type: offer.offerType, amount: offer.offerAmount },
          wanting: { type: offer.wantType, amount: offer.wantAmount },
          expiresAt: offer.expiresAt,
        },
      },
    });
  } catch (error) {
    console.error('Error creating marketplace offer:', error);
    res.status(500).json({ success: false, error: 'Failed to create offer' });
  }
});

// POST /api/marketplace/accept/:offerId - Accept an offer
router.post('/accept/:offerId', async (req: AuthRequest, res: Response) => {
  try {
    const { offerId } = req.params;
    const { villageId } = req.body;

    if (!villageId) {
      return res.status(400).json({ success: false, error: 'Village ID required' });
    }

    // Verify user owns this village
    const buyerVillage = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
      include: {
        user: true,
      },
    });

    if (!buyerVillage) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Get the offer
    const offer = await prisma.marketOffer.findUnique({
      where: { id: offerId },
      include: {
        village: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    // Check if offer is still valid
    if (new Date() > offer.expiresAt) {
      return res.status(400).json({ success: false, error: 'Offer has expired' });
    }

    // Can't accept your own offer
    if (offer.villageId === villageId) {
      return res.status(400).json({ success: false, error: 'Cannot accept your own offer' });
    }

    // Check if buyer has enough resources (what the seller wants)
    const resourceToDeduct = {
      lumber: offer.wantType === 'lumber' ? offer.wantAmount : 0,
      clay: offer.wantType === 'clay' ? offer.wantAmount : 0,
      iron: offer.wantType === 'iron' ? offer.wantAmount : 0,
      crop: offer.wantType === 'crop' ? offer.wantAmount : 0,
    };

    const { hasEnough, current } = await hasEnoughResources(villageId, resourceToDeduct);
    if (!hasEnough) {
      return res.status(400).json({
        success: false,
        error: 'Not enough resources to complete trade',
        data: { required: resourceToDeduct, current },
      });
    }

    // Calculate travel time with tribe-specific speed
    const travelTime = calculateTravelTime(
      buyerVillage.xCoord,
      buyerVillage.yCoord,
      offer.village.xCoord,
      offer.village.yCoord,
      buyerVillage.user.tribe
    );

    // Calculate merchants needed with Trade Office bonus
    const totalResources = offer.wantAmount;
    const merchantsNeeded = await calculateMerchantsNeeded(
      villageId,
      totalResources,
      buyerVillage.user.tribe
    );

    // Deduct resources from buyer
    await deductResources(villageId, resourceToDeduct);

    // Create trade route to seller (buyer's resources)
    const arrivesAtSeller = new Date(Date.now() + travelTime * 1000);
    await prisma.tradeRoute.create({
      data: {
        fromVillageId: villageId,
        toVillageId: offer.villageId,
        resources: JSON.stringify(resourceToDeduct),
        arrivesAt: arrivesAtSeller,
      },
    });

    // Create game job for resources arriving at seller
    await prisma.gameJob.create({
      data: {
        type: 'trade_arrive',
        villageId: offer.villageId,
        data: JSON.stringify({ resources: resourceToDeduct }),
        scheduledFor: arrivesAtSeller,
      },
    });

    // Create trade route back to buyer (seller's resources)
    const resourceToSend = {
      lumber: offer.offerType === 'lumber' ? offer.offerAmount : 0,
      clay: offer.offerType === 'clay' ? offer.offerAmount : 0,
      iron: offer.offerType === 'iron' ? offer.offerAmount : 0,
      crop: offer.offerType === 'crop' ? offer.offerAmount : 0,
    };

    const arrivesAtBuyer = new Date(Date.now() + travelTime * 2 * 1000); // Return trip
    await prisma.tradeRoute.create({
      data: {
        fromVillageId: offer.villageId,
        toVillageId: villageId,
        resources: JSON.stringify(resourceToSend),
        arrivesAt: arrivesAtBuyer,
      },
    });

    // Create game job for resources arriving at buyer
    await prisma.gameJob.create({
      data: {
        type: 'trade_arrive',
        villageId: villageId,
        data: JSON.stringify({ resources: resourceToSend }),
        scheduledFor: arrivesAtBuyer,
      },
    });

    // Delete the offer
    await prisma.marketOffer.delete({
      where: { id: offerId },
    });

    res.json({
      success: true,
      data: {
        message: 'Trade accepted',
        merchantsUsed: merchantsNeeded,
        travelTime,
        arrivesAt: arrivesAtBuyer,
      },
    });
  } catch (error) {
    console.error('Error accepting offer:', error);
    res.status(500).json({ success: false, error: 'Failed to accept offer' });
  }
});

// DELETE /api/marketplace/offer/:offerId - Cancel own offer
router.delete('/offer/:offerId', async (req: AuthRequest, res: Response) => {
  try {
    const { offerId } = req.params;

    const offer = await prisma.marketOffer.findUnique({
      where: { id: offerId },
      include: {
        village: true,
      },
    });

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    // Verify user owns the village that made this offer
    if (offer.village.userId !== req.userId) {
      return res.status(403).json({ success: false, error: 'Not authorized to cancel this offer' });
    }

    // Return resources to the seller
    const resourceToReturn = {
      lumber: offer.offerType === 'lumber' ? offer.offerAmount : 0,
      clay: offer.offerType === 'clay' ? offer.offerAmount : 0,
      iron: offer.offerType === 'iron' ? offer.offerAmount : 0,
      crop: offer.offerType === 'crop' ? offer.offerAmount : 0,
    };

    await addResources(offer.villageId, resourceToReturn);

    // Delete the offer
    await prisma.marketOffer.delete({
      where: { id: offerId },
    });

    res.json({ success: true, data: { message: 'Offer cancelled' } });
  } catch (error) {
    console.error('Error cancelling offer:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel offer' });
  }
});

// GET /api/marketplace/trades - Get active trade routes
router.get('/trades', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.query;

    if (!villageId || typeof villageId !== 'string') {
      return res.status(400).json({ success: false, error: 'Village ID required' });
    }

    // Verify user owns this village
    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    const now = new Date();

    // Get incoming trades
    const incomingTrades = await prisma.tradeRoute.findMany({
      where: {
        toVillageId: villageId,
        arrivesAt: { gt: now },
      },
      include: {
        fromVillage: {
          select: {
            name: true,
            xCoord: true,
            yCoord: true,
          },
        },
      },
      orderBy: { arrivesAt: 'asc' },
    });

    // Get outgoing trades
    const outgoingTrades = await prisma.tradeRoute.findMany({
      where: {
        fromVillageId: villageId,
        arrivesAt: { gt: now },
      },
      include: {
        toVillage: {
          select: {
            name: true,
            xCoord: true,
            yCoord: true,
          },
        },
      },
      orderBy: { arrivesAt: 'asc' },
    });

    const formattedIncoming = incomingTrades.map((trade) => ({
      id: trade.id,
      from: {
        name: trade.fromVillage.name,
        coordinates: { x: trade.fromVillage.xCoord, y: trade.fromVillage.yCoord },
      },
      resources: JSON.parse(trade.resources),
      departedAt: trade.departedAt,
      arrivesAt: trade.arrivesAt,
    }));

    const formattedOutgoing = outgoingTrades.map((trade) => ({
      id: trade.id,
      to: {
        name: trade.toVillage.name,
        coordinates: { x: trade.toVillage.xCoord, y: trade.toVillage.yCoord },
      },
      resources: JSON.parse(trade.resources),
      departedAt: trade.departedAt,
      arrivesAt: trade.arrivesAt,
    }));

    res.json({
      success: true,
      data: {
        incoming: formattedIncoming,
        outgoing: formattedOutgoing,
      },
    });
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trades' });
  }
});

// POST /api/marketplace/npc-trade - NPC Merchant instant trade with gold
router.post('/npc-trade', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId, fromResource, toResource, amount } = req.body;

    if (!villageId || !fromResource || !toResource || !amount) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (amount < 1) {
      return res.status(400).json({ success: false, error: 'Amount must be positive' });
    }

    if (fromResource === toResource) {
      return res.status(400).json({ success: false, error: 'Cannot trade same resource type' });
    }

    const validTypes = ['lumber', 'clay', 'iron', 'crop'];
    if (!validTypes.includes(fromResource) || !validTypes.includes(toResource)) {
      return res.status(400).json({ success: false, error: 'Invalid resource type' });
    }

    // Verify user owns this village
    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
      include: {
        user: true,
      },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Check if marketplace exists
    const marketplace = await prisma.building.findFirst({
      where: {
        villageId,
        type: 'marketplace',
      },
    });

    if (!marketplace || marketplace.level === 0) {
      return res.status(400).json({
        success: false,
        error: 'You need a Marketplace to use NPC trading',
      });
    }

    // Calculate gold cost (1 gold per 100 resources, minimum 1)
    const goldCost = Math.max(1, Math.ceil(amount / 100));

    // Check if user has enough gold
    if (village.user.gold < goldCost) {
      return res.status(400).json({
        success: false,
        error: `Not enough gold. Need ${goldCost} gold, have ${village.user.gold} gold`,
      });
    }

    // Check if user has enough of the source resource
    const resourceToDeduct = {
      lumber: fromResource === 'lumber' ? amount : 0,
      clay: fromResource === 'clay' ? amount : 0,
      iron: fromResource === 'iron' ? amount : 0,
      crop: fromResource === 'crop' ? amount : 0,
    };

    const { hasEnough, current } = await hasEnoughResources(villageId, resourceToDeduct);
    if (!hasEnough) {
      return res.status(400).json({
        success: false,
        error: 'Not enough resources',
        data: { required: resourceToDeduct, current },
      });
    }

    // Deduct source resource
    await deductResources(villageId, resourceToDeduct);

    // Add target resource (1:1 exchange)
    const resourceToAdd = {
      lumber: toResource === 'lumber' ? amount : 0,
      clay: toResource === 'clay' ? amount : 0,
      iron: toResource === 'iron' ? amount : 0,
      crop: toResource === 'crop' ? amount : 0,
    };

    await addResources(villageId, resourceToAdd);

    // Deduct gold
    await prisma.user.update({
      where: { id: req.userId },
      data: {
        gold: village.user.gold - goldCost,
      },
    });

    res.json({
      success: true,
      data: {
        message: 'NPC trade completed successfully',
        traded: { from: fromResource, to: toResource, amount },
        goldCost,
        remainingGold: village.user.gold - goldCost,
      },
    });
  } catch (error) {
    console.error('Error executing NPC trade:', error);
    res.status(500).json({ success: false, error: 'Failed to execute NPC trade' });
  }
});

// GET /api/marketplace/merchant-info - Get merchant capacity and availability
router.get('/merchant-info', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.query;

    if (!villageId || typeof villageId !== 'string') {
      return res.status(400).json({ success: false, error: 'Village ID required' });
    }

    // Verify user owns this village
    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
      include: {
        user: true,
      },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Get Trade Office level
    const tradeOffice = await prisma.building.findFirst({
      where: {
        villageId,
        type: 'trade_office',
      },
    });

    const baseCapacity = MERCHANT_CAPACITY[village.user.tribe] || 500;
    const capacity = await calculateMerchantCapacity(villageId, village.user.tribe);
    const tradeOfficeLevel = tradeOffice?.level || 0;
    const tradeOfficeBonus = tradeOfficeLevel * 20; // percentage
    const merchantSpeed = MERCHANT_SPEED[village.user.tribe] || 16;

    res.json({
      success: true,
      data: {
        tribe: village.user.tribe,
        baseCapacity,
        currentCapacity: capacity,
        tradeOfficeLevel,
        tradeOfficeBonus,
        merchantSpeed,
        gold: village.user.gold,
      },
    });
  } catch (error) {
    console.error('Error fetching merchant info:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch merchant info' });
  }
});

export { router as marketplaceRouter };
