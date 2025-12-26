import { useState, useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { marketplaceApi } from '../services/api';
import styles from './MarketplaceView.module.css';

interface Offer {
  id: string;
  village?: {
    id: string;
    name: string;
    coordinates: { x: number; y: number };
    owner: string;
  };
  offering: {
    type: string;
    amount: number;
  };
  wanting: {
    type: string;
    amount: number;
  };
  createdAt: string;
  expiresAt: string;
}

interface Trade {
  id: string;
  from?: {
    name: string;
    coordinates: { x: number; y: number };
  };
  to?: {
    name: string;
    coordinates: { x: number; y: number };
  };
  resources: {
    lumber: number;
    clay: number;
    iron: number;
    crop: number;
  };
  departedAt: string;
  arrivesAt: string;
}

const RESOURCE_TYPES = [
  { value: 'lumber', label: 'Lumber', color: '#8B4513' },
  { value: 'clay', label: 'Clay', color: '#CD853F' },
  { value: 'iron', label: 'Iron', color: '#708090' },
  { value: 'crop', label: 'Crop', color: '#DAA520' },
];

export function MarketplaceView() {
  const currentVillage = useGameStore((state) => state.currentVillage);
  const [activeTab, setActiveTab] = useState<'offers' | 'my-offers' | 'create' | 'trades' | 'npc'>('offers');

  // Offers state
  const [offers, setOffers] = useState<Offer[]>([]);
  const [myOffers, setMyOffers] = useState<Offer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);

  // Create offer state
  const [offerType, setOfferType] = useState('lumber');
  const [offerAmount, setOfferAmount] = useState(100);
  const [wantType, setWantType] = useState('clay');
  const [wantAmount, setWantAmount] = useState(100);
  const [isCreating, setIsCreating] = useState(false);

  // Trades state
  const [incomingTrades, setIncomingTrades] = useState<Trade[]>([]);
  const [outgoingTrades, setOutgoingTrades] = useState<Trade[]>([]);

  // NPC trade state
  const [npcFromResource, setNpcFromResource] = useState('lumber');
  const [npcToResource, setNpcToResource] = useState('clay');
  const [npcAmount, setNpcAmount] = useState(100);
  const [merchantInfo, setMerchantInfo] = useState<any>(null);
  const [isNpcTrading, setIsNpcTrading] = useState(false);

  // Error/success
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (currentVillage) {
      loadData();
    }
  }, [currentVillage?.id, activeTab]);

  async function loadData() {
    if (!currentVillage) return;
    setError(null);
    setLoadingOffers(true);

    try {
      if (activeTab === 'offers') {
        const response = await marketplaceApi.getOffers(currentVillage.id);
        setOffers(response.data.offers);
      } else if (activeTab === 'my-offers') {
        const response = await marketplaceApi.getMyOffers(currentVillage.id);
        setMyOffers(response.data.offers);
      } else if (activeTab === 'trades') {
        const response = await marketplaceApi.getTrades(currentVillage.id);
        setIncomingTrades(response.data.incoming);
        setOutgoingTrades(response.data.outgoing);
      } else if (activeTab === 'npc') {
        const response = await marketplaceApi.getMerchantInfo(currentVillage.id);
        setMerchantInfo(response.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoadingOffers(false);
    }
  }

  async function handleCreateOffer() {
    if (!currentVillage) return;
    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      await marketplaceApi.createOffer(
        currentVillage.id,
        offerType,
        offerAmount,
        wantType,
        wantAmount
      );
      setSuccess('Offer created successfully!');
      setOfferAmount(100);
      setWantAmount(100);
      setTimeout(() => setActiveTab('my-offers'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create offer');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleAcceptOffer(offerId: string) {
    if (!currentVillage) return;
    setError(null);
    setSuccess(null);

    try {
      const response = await marketplaceApi.acceptOffer(offerId, currentVillage.id);
      setSuccess(
        `Trade accepted! Merchants will arrive in ${Math.floor(response.data.travelTime / 60)} minutes.`
      );
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept offer');
    }
  }

  async function handleCancelOffer(offerId: string) {
    setError(null);
    setSuccess(null);

    try {
      await marketplaceApi.cancelOffer(offerId);
      setSuccess('Offer cancelled successfully!');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel offer');
    }
  }

  async function handleNpcTrade() {
    if (!currentVillage) return;
    setIsNpcTrading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await marketplaceApi.npcTrade(
        currentVillage.id,
        npcFromResource,
        npcToResource,
        npcAmount
      );
      setSuccess(
        `NPC trade successful! Exchanged ${npcAmount} ${getResourceLabel(npcFromResource)} for ${npcAmount} ${getResourceLabel(npcToResource)}. Gold cost: ${response.data.goldCost}. Remaining gold: ${response.data.remainingGold}`
      );
      // Refresh merchant info and village resources
      loadData();
      useGameStore.getState().refreshCurrentVillage();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute NPC trade');
    } finally {
      setIsNpcTrading(false);
    }
  }

  function getResourceColor(type: string): string {
    return RESOURCE_TYPES.find((r) => r.value === type)?.color || '#000';
  }

  function getResourceLabel(type: string): string {
    return RESOURCE_TYPES.find((r) => r.value === type)?.label || type;
  }

  function formatTimeRemaining(expiresAt: string): string {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }

  function hasEnoughResources(type: string, amount: number): boolean {
    if (!currentVillage) return false;
    const resourceValue = currentVillage.resources[type as keyof typeof currentVillage.resources];
    return resourceValue >= amount;
  }

  if (!currentVillage) {
    return <div className={styles.loading}>Loading village...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Marketplace</h2>
        <div className={styles.resourceDisplay}>
          {RESOURCE_TYPES.map((res) => (
            <div key={res.value} className={styles.resourceItem}>
              <span
                className={styles.resourceIcon}
                style={{ backgroundColor: res.color }}
              />
              <span>{Math.floor(currentVillage.resources[res.value as keyof typeof currentVillage.resources])}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.tabs}>
        <button
          className={activeTab === 'offers' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('offers')}
        >
          Available Offers
        </button>
        <button
          className={activeTab === 'my-offers' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('my-offers')}
        >
          My Offers
        </button>
        <button
          className={activeTab === 'create' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('create')}
        >
          Create Offer
        </button>
        <button
          className={activeTab === 'npc' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('npc')}
        >
          NPC Merchant
        </button>
        <button
          className={activeTab === 'trades' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('trades')}
        >
          Active Trades
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {activeTab === 'offers' && (
        <div className="panel">
          <div className="panel-header">Available Trade Offers</div>
          <div className="panel-body">
            {loadingOffers ? (
              <div className={styles.loading}>Loading offers...</div>
            ) : offers.length === 0 ? (
              <div className={styles.noOffers}>No offers available at the moment.</div>
            ) : (
              <div className={styles.offersList}>
                {offers.map((offer) => (
                  <div key={offer.id} className={styles.offerCard}>
                    <div className={styles.offerHeader}>
                      <span className={styles.villageName}>{offer.village?.name}</span>
                      <span className={styles.coordinates}>
                        ({offer.village?.coordinates.x}|{offer.village?.coordinates.y})
                      </span>
                      <span className={styles.owner}>by {offer.village?.owner}</span>
                    </div>
                    <div className={styles.offerBody}>
                      <div className={styles.offerSection}>
                        <span className={styles.label}>Offering:</span>
                        <div className={styles.resource}>
                          <span
                            className={styles.resourceIcon}
                            style={{ backgroundColor: getResourceColor(offer.offering.type) }}
                          />
                          <span className={styles.resourceAmount}>
                            {offer.offering.amount.toLocaleString()} {getResourceLabel(offer.offering.type)}
                          </span>
                        </div>
                      </div>
                      <div className={styles.arrow}>→</div>
                      <div className={styles.offerSection}>
                        <span className={styles.label}>Wanting:</span>
                        <div className={styles.resource}>
                          <span
                            className={styles.resourceIcon}
                            style={{ backgroundColor: getResourceColor(offer.wanting.type) }}
                          />
                          <span className={styles.resourceAmount}>
                            {offer.wanting.amount.toLocaleString()} {getResourceLabel(offer.wanting.type)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={styles.offerFooter}>
                      <span className={styles.expires}>
                        Expires in: {formatTimeRemaining(offer.expiresAt)}
                      </span>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleAcceptOffer(offer.id)}
                        disabled={!hasEnoughResources(offer.wanting.type, offer.wanting.amount)}
                      >
                        {hasEnoughResources(offer.wanting.type, offer.wanting.amount)
                          ? 'Accept Trade'
                          : 'Not Enough Resources'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'my-offers' && (
        <div className="panel">
          <div className="panel-header">My Active Offers</div>
          <div className="panel-body">
            {loadingOffers ? (
              <div className={styles.loading}>Loading offers...</div>
            ) : myOffers.length === 0 ? (
              <div className={styles.noOffers}>You have no active offers.</div>
            ) : (
              <div className={styles.offersList}>
                {myOffers.map((offer) => (
                  <div key={offer.id} className={styles.offerCard}>
                    <div className={styles.offerBody}>
                      <div className={styles.offerSection}>
                        <span className={styles.label}>Offering:</span>
                        <div className={styles.resource}>
                          <span
                            className={styles.resourceIcon}
                            style={{ backgroundColor: getResourceColor(offer.offering.type) }}
                          />
                          <span className={styles.resourceAmount}>
                            {offer.offering.amount.toLocaleString()} {getResourceLabel(offer.offering.type)}
                          </span>
                        </div>
                      </div>
                      <div className={styles.arrow}>→</div>
                      <div className={styles.offerSection}>
                        <span className={styles.label}>Wanting:</span>
                        <div className={styles.resource}>
                          <span
                            className={styles.resourceIcon}
                            style={{ backgroundColor: getResourceColor(offer.wanting.type) }}
                          />
                          <span className={styles.resourceAmount}>
                            {offer.wanting.amount.toLocaleString()} {getResourceLabel(offer.wanting.type)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={styles.offerFooter}>
                      <span className={styles.expires}>
                        Expires in: {formatTimeRemaining(offer.expiresAt)}
                      </span>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleCancelOffer(offer.id)}
                      >
                        Cancel Offer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'create' && (
        <div className="panel">
          <div className="panel-header">Create New Trade Offer</div>
          <div className="panel-body">
            <div className={styles.createForm}>
              <div className={styles.formSection}>
                <h3>What are you offering?</h3>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className="form-label">Resource Type</label>
                    <select
                      className={styles.select}
                      value={offerType}
                      onChange={(e) => setOfferType(e.target.value)}
                    >
                      {RESOURCE_TYPES.map((res) => (
                        <option key={res.value} value={res.value}>
                          {res.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className="form-label">Amount</label>
                    <input
                      type="number"
                      className={styles.input}
                      value={offerAmount}
                      onChange={(e) => setOfferAmount(Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      step={10}
                    />
                  </div>
                </div>
                <div className={styles.resourcePreview}>
                  <span
                    className={styles.resourceIcon}
                    style={{ backgroundColor: getResourceColor(offerType) }}
                  />
                  <span>
                    You have: {Math.floor(currentVillage.resources[offerType as keyof typeof currentVillage.resources])} {getResourceLabel(offerType)}
                  </span>
                </div>
              </div>

              <div className={styles.formSection}>
                <h3>What do you want?</h3>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className="form-label">Resource Type</label>
                    <select
                      className={styles.select}
                      value={wantType}
                      onChange={(e) => setWantType(e.target.value)}
                    >
                      {RESOURCE_TYPES.filter((r) => r.value !== offerType).map((res) => (
                        <option key={res.value} value={res.value}>
                          {res.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className="form-label">Amount</label>
                    <input
                      type="number"
                      className={styles.input}
                      value={wantAmount}
                      onChange={(e) => setWantAmount(Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      step={10}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.tradeSummary}>
                <p>
                  Exchange rate: 1 {getResourceLabel(offerType)} = {(wantAmount / offerAmount).toFixed(2)} {getResourceLabel(wantType)}
                </p>
                <p className={styles.note}>
                  Note: Your resources will be locked until the trade is completed or cancelled.
                </p>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleCreateOffer}
                disabled={
                  isCreating ||
                  !hasEnoughResources(offerType, offerAmount) ||
                  offerAmount < 1 ||
                  wantAmount < 1
                }
              >
                {isCreating ? 'Creating...' : 'Create Offer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'npc' && (
        <div className="panel">
          <div className="panel-header">NPC Merchant - Instant Resource Exchange</div>
          <div className="panel-body">
            {merchantInfo && (
              <div className={styles.merchantInfo}>
                <div className={styles.infoSection}>
                  <h3>Merchant Information</h3>
                  <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Tribe:</span>
                      <span className={styles.infoValue}>{merchantInfo.tribe.charAt(0).toUpperCase() + merchantInfo.tribe.slice(1)}</span>
                    </div>
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Base Capacity:</span>
                      <span className={styles.infoValue}>{merchantInfo.baseCapacity} resources</span>
                    </div>
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Current Capacity:</span>
                      <span className={styles.infoValue}>{merchantInfo.currentCapacity} resources</span>
                    </div>
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Trade Office Level:</span>
                      <span className={styles.infoValue}>{merchantInfo.tradeOfficeLevel}</span>
                    </div>
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Trade Office Bonus:</span>
                      <span className={styles.infoValue}>+{merchantInfo.tradeOfficeBonus}%</span>
                    </div>
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Merchant Speed:</span>
                      <span className={styles.infoValue}>{merchantInfo.merchantSpeed} fields/hour</span>
                    </div>
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Your Gold:</span>
                      <span className={styles.infoValue} style={{ color: '#FFD700', fontWeight: 'bold' }}>{merchantInfo.gold} gold</span>
                    </div>
                  </div>
                </div>

                <div className={styles.npcTradeForm}>
                  <h3>Exchange Resources with NPC Merchant</h3>
                  <p className={styles.npcDescription}>
                    The NPC Merchant allows instant resource exchange at a 1:1 ratio for a small gold cost.
                    Cost: 1 gold per 100 resources (minimum 1 gold).
                  </p>

                  <div className={styles.formRow}>
                    <div className={styles.formSection}>
                      <h4>Exchange From:</h4>
                      <div className={styles.formGroup}>
                        <label className="form-label">Resource Type</label>
                        <select
                          className={styles.select}
                          value={npcFromResource}
                          onChange={(e) => setNpcFromResource(e.target.value)}
                        >
                          {RESOURCE_TYPES.map((res) => (
                            <option key={res.value} value={res.value}>
                              {res.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.resourcePreview}>
                        <span
                          className={styles.resourceIcon}
                          style={{ backgroundColor: getResourceColor(npcFromResource) }}
                        />
                        <span>
                          You have: {Math.floor(currentVillage.resources[npcFromResource as keyof typeof currentVillage.resources])} {getResourceLabel(npcFromResource)}
                        </span>
                      </div>
                    </div>

                    <div className={styles.arrow} style={{ fontSize: '2rem', alignSelf: 'center' }}>→</div>

                    <div className={styles.formSection}>
                      <h4>Exchange To:</h4>
                      <div className={styles.formGroup}>
                        <label className="form-label">Resource Type</label>
                        <select
                          className={styles.select}
                          value={npcToResource}
                          onChange={(e) => setNpcToResource(e.target.value)}
                        >
                          {RESOURCE_TYPES.filter((r) => r.value !== npcFromResource).map((res) => (
                            <option key={res.value} value={res.value}>
                              {res.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
                    <label className="form-label">Amount to Exchange</label>
                    <input
                      type="number"
                      className={styles.input}
                      value={npcAmount}
                      onChange={(e) => setNpcAmount(Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      step={10}
                    />
                  </div>

                  <div className={styles.tradeSummary}>
                    <p>
                      <strong>Exchange:</strong> {npcAmount} {getResourceLabel(npcFromResource)} → {npcAmount} {getResourceLabel(npcToResource)}
                    </p>
                    <p>
                      <strong>Gold Cost:</strong> {Math.max(1, Math.ceil(npcAmount / 100))} gold
                    </p>
                    <p className={styles.note}>
                      This is an instant trade - no merchants travel time required!
                    </p>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={handleNpcTrade}
                    disabled={
                      isNpcTrading ||
                      !hasEnoughResources(npcFromResource, npcAmount) ||
                      merchantInfo.gold < Math.max(1, Math.ceil(npcAmount / 100)) ||
                      npcAmount < 1
                    }
                  >
                    {isNpcTrading ? 'Processing...' : 'Execute NPC Trade'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'trades' && (
        <div className={styles.tradesContainer}>
          <div className="panel">
            <div className="panel-header">Incoming Merchants</div>
            <div className="panel-body">
              {incomingTrades.length === 0 ? (
                <div className={styles.noTrades}>No incoming trades</div>
              ) : (
                <div className={styles.tradesList}>
                  {incomingTrades.map((trade) => (
                    <div key={trade.id} className={styles.tradeCard}>
                      <div className={styles.tradeInfo}>
                        <span>From: {trade.from?.name}</span>
                        <span className={styles.coordinates}>
                          ({trade.from?.coordinates.x}|{trade.from?.coordinates.y})
                        </span>
                      </div>
                      <div className={styles.tradeResources}>
                        {Object.entries(trade.resources).map(([type, amount]) =>
                          amount > 0 ? (
                            <div key={type} className={styles.resourceItem}>
                              <span
                                className={styles.resourceIcon}
                                style={{ backgroundColor: getResourceColor(type) }}
                              />
                              <span>{amount.toLocaleString()}</span>
                            </div>
                          ) : null
                        )}
                      </div>
                      <div className={styles.tradeTime}>
                        Arrives: {new Date(trade.arrivesAt).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">Outgoing Merchants</div>
            <div className="panel-body">
              {outgoingTrades.length === 0 ? (
                <div className={styles.noTrades}>No outgoing trades</div>
              ) : (
                <div className={styles.tradesList}>
                  {outgoingTrades.map((trade) => (
                    <div key={trade.id} className={styles.tradeCard}>
                      <div className={styles.tradeInfo}>
                        <span>To: {trade.to?.name}</span>
                        <span className={styles.coordinates}>
                          ({trade.to?.coordinates.x}|{trade.to?.coordinates.y})
                        </span>
                      </div>
                      <div className={styles.tradeResources}>
                        {Object.entries(trade.resources).map(([type, amount]) =>
                          amount > 0 ? (
                            <div key={type} className={styles.resourceItem}>
                              <span
                                className={styles.resourceIcon}
                                style={{ backgroundColor: getResourceColor(type) }}
                              />
                              <span>{amount.toLocaleString()}</span>
                            </div>
                          ) : null
                        )}
                      </div>
                      <div className={styles.tradeTime}>
                        Arrives: {new Date(trade.arrivesAt).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
