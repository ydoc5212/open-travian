import { useState, useEffect } from 'react';
import { allianceApi } from '../services/api';
import styles from './AllianceView.module.css';

interface AllianceMember {
  id?: string;
  userId: string;
  username: string;
  tribe: string;
  role: string;
  joinedAt: string;
  population: number;
}

interface Alliance {
  id: string;
  name: string;
  tag: string;
  founderId: string;
  createdAt: string;
  members: AllianceMember[];
  myRole?: string;
}

interface AllianceMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  senderRole: string;
  subject: string;
  body: string;
  sentAt: string;
}

interface DiplomaticRelation {
  id: string;
  initiatorId: string;
  targetId: string;
  relationType: string;
  status: string;
  createdAt: string;
  initiatorAlliance: { id: string; name: string; tag: string };
  targetAlliance: { id: string; name: string; tag: string };
}

export function AllianceView() {
  const [alliance, setAlliance] = useState<Alliance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create alliance form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [allianceName, setAllianceName] = useState('');
  const [allianceTag, setAllianceTag] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Invite player form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  // Role management
  const [changingRole, setChangingRole] = useState<string | null>(null);

  // Alliance messaging
  const [allianceMessages, setAllianceMessages] = useState<AllianceMessage[]>([]);
  const [showMessageForm, setShowMessageForm] = useState(false);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Diplomacy
  const [diplomacy, setDiplomacy] = useState<DiplomaticRelation[]>([]);
  const [showDiplomacyForm, setShowDiplomacyForm] = useState(false);
  const [targetAllianceId, setTargetAllianceId] = useState('');
  const [relationType, setRelationType] = useState<'nap' | 'confederation' | 'war'>('nap');
  const [proposingDiplomacy, setProposingDiplomacy] = useState(false);

  useEffect(() => {
    loadAlliance();
  }, []);

  async function loadAlliance() {
    try {
      setLoading(true);
      setError(null);
      const response = await allianceApi.getCurrent();
      setAlliance(response.data.alliance);

      // Load alliance messages and diplomacy if in an alliance
      if (response.data.alliance) {
        const [messagesResponse, diplomacyResponse] = await Promise.all([
          allianceApi.getMessages(),
          allianceApi.getDiplomacy(),
        ]);
        setAllianceMessages(messagesResponse.data.messages);
        setDiplomacy(diplomacyResponse.data.relations);
      }
    } catch (err) {
      console.error('Failed to load alliance:', err);
      setError('Failed to load alliance data');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAlliance(e: React.FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      await allianceApi.create(allianceName, allianceTag);
      setSuccess('Alliance created successfully!');
      setShowCreateForm(false);
      setAllianceName('');
      setAllianceTag('');
      await loadAlliance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create alliance');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleInvitePlayer(e: React.FormEvent) {
    e.preventDefault();
    setIsInviting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await allianceApi.invite(inviteUsername);
      setSuccess(response.data.message);
      setShowInviteForm(false);
      setInviteUsername('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite player');
    } finally {
      setIsInviting(false);
    }
  }

  async function handleLeaveAlliance() {
    if (!confirm('Are you sure you want to leave this alliance?')) return;

    try {
      setError(null);
      setSuccess(null);
      const response = await allianceApi.leave();
      setSuccess(response.data.message);
      await loadAlliance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave alliance');
    }
  }

  async function handleKickMember(userId: string, username: string) {
    if (!confirm(`Are you sure you want to kick ${username} from the alliance?`)) return;

    try {
      setError(null);
      setSuccess(null);
      const response = await allianceApi.kick(userId);
      setSuccess(response.data.message);
      await loadAlliance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to kick member');
    }
  }

  async function handleChangeRole(userId: string, newRole: string) {
    try {
      setError(null);
      setSuccess(null);
      setChangingRole(userId);
      const response = await allianceApi.changeRole(userId, newRole);
      setSuccess(response.data.message);
      await loadAlliance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
    } finally {
      setChangingRole(null);
    }
  }

  function getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'founder':
        return styles.roleFounder;
      case 'leader':
        return styles.roleLeader;
      case 'officer':
        return styles.roleOfficer;
      default:
        return styles.roleMember;
    }
  }

  function getRoleLabel(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  function canInvite(): boolean {
    if (!alliance || !alliance.myRole) return false;
    return ['founder', 'leader', 'officer'].includes(alliance.myRole);
  }

  function canKick(memberRole: string): boolean {
    if (!alliance || !alliance.myRole) return false;
    if (alliance.myRole === 'founder') return memberRole !== 'founder';
    if (alliance.myRole === 'leader') return !['founder', 'leader'].includes(memberRole);
    return false;
  }

  function canChangeRole(): boolean {
    if (!alliance || !alliance.myRole) return false;
    return alliance.myRole === 'founder';
  }

  // Alliance messaging handlers
  async function handleSendAllianceMessage(e: React.FormEvent) {
    e.preventDefault();
    setSendingMessage(true);
    setError(null);
    setSuccess(null);

    try {
      await allianceApi.sendMessage(messageSubject, messageBody);
      setSuccess('Message sent to all alliance members!');
      setShowMessageForm(false);
      setMessageSubject('');
      setMessageBody('');
      await loadAlliance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  }

  function canSendAllianceMessage(): boolean {
    if (!alliance || !alliance.myRole) return false;
    return ['founder', 'leader', 'officer'].includes(alliance.myRole);
  }

  // Diplomacy handlers
  async function handleProposeDiplomacy(e: React.FormEvent) {
    e.preventDefault();
    setProposingDiplomacy(true);
    setError(null);
    setSuccess(null);

    try {
      await allianceApi.proposeDiplomacy(targetAllianceId, relationType);
      const relationTypeLabel = relationType === 'nap' ? 'Non-Aggression Pact' : relationType === 'confederation' ? 'Confederation' : 'War';
      setSuccess(`${relationTypeLabel} ${relationType === 'war' ? 'declared' : 'proposed'}!`);
      setShowDiplomacyForm(false);
      setTargetAllianceId('');
      setRelationType('nap');
      await loadAlliance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to propose diplomatic relation');
    } finally {
      setProposingDiplomacy(false);
    }
  }

  async function handleAcceptDiplomacy(relationId: string) {
    try {
      setError(null);
      setSuccess(null);
      await allianceApi.acceptDiplomacy(relationId);
      setSuccess('Diplomatic proposal accepted!');
      await loadAlliance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept diplomatic relation');
    }
  }

  async function handleRejectDiplomacy(relationId: string) {
    try {
      setError(null);
      setSuccess(null);
      await allianceApi.rejectDiplomacy(relationId);
      setSuccess('Diplomatic proposal rejected!');
      await loadAlliance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject diplomatic relation');
    }
  }

  async function handleEndDiplomacy(relationId: string) {
    if (!confirm('Are you sure you want to end this diplomatic relation?')) return;

    try {
      setError(null);
      setSuccess(null);
      await allianceApi.endDiplomacy(relationId);
      setSuccess('Diplomatic relation ended!');
      await loadAlliance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end diplomatic relation');
    }
  }

  function canManageDiplomacy(): boolean {
    if (!alliance || !alliance.myRole) return false;
    return ['founder', 'leader'].includes(alliance.myRole);
  }

  function getRelationTypeLabel(type: string): string {
    switch (type) {
      case 'nap': return 'Non-Aggression Pact';
      case 'confederation': return 'Confederation';
      case 'war': return 'War';
      default: return type;
    }
  }

  function getRelationTypeColor(type: string): string {
    switch (type) {
      case 'nap': return '#4CAF50';
      case 'confederation': return '#2196F3';
      case 'war': return '#c41e3a';
      default: return '#666';
    }
  }

  if (loading) {
    return <div className={styles.loading}>Loading alliance data...</div>;
  }

  return (
    <div className={styles.container}>
      {error && (
        <div className="alert alert-error m-2">
          {error}
          <button className={styles.closeAlert} onClick={() => setError(null)}>×</button>
        </div>
      )}

      {success && (
        <div className="alert alert-success m-2">
          {success}
          <button className={styles.closeAlert} onClick={() => setSuccess(null)}>×</button>
        </div>
      )}

      {!alliance ? (
        // Not in an alliance - show create form
        <div className={styles.notInAlliance}>
          <div className="panel">
            <div className="panel-header">Alliance</div>
            <div className="panel-body">
              <p className={styles.notInText}>You are not currently in an alliance.</p>

              {!showCreateForm ? (
                <button
                  className="btn btn-primary"
                  onClick={() => setShowCreateForm(true)}
                >
                  Create Alliance
                </button>
              ) : (
                <form onSubmit={handleCreateAlliance} className={styles.createForm}>
                  <div className="form-group">
                    <label className="form-label">Alliance Name</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Enter alliance name (3-30 characters)"
                      value={allianceName}
                      onChange={(e) => setAllianceName(e.target.value)}
                      minLength={3}
                      maxLength={30}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Alliance Tag</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Enter alliance tag (2-8 characters)"
                      value={allianceTag}
                      onChange={(e) => setAllianceTag(e.target.value.toUpperCase())}
                      minLength={2}
                      maxLength={8}
                      required
                    />
                  </div>

                  <div className={styles.formActions}>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isCreating}
                    >
                      {isCreating ? 'Creating...' : 'Create Alliance'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowCreateForm(false);
                        setAllianceName('');
                        setAllianceTag('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      ) : (
        // In an alliance - show alliance info
        <div className={styles.allianceContent}>
          {/* Alliance Header */}
          <div className="panel">
            <div className="panel-header">Alliance Information</div>
            <div className="panel-body">
              <div className={styles.allianceHeader}>
                <div className={styles.allianceInfo}>
                  <h2 className={styles.allianceName}>
                    [{alliance.tag}] {alliance.name}
                  </h2>
                  <div className={styles.allianceMeta}>
                    <span>Members: <strong>{alliance.members.length}</strong></span>
                    <span>|</span>
                    <span>Total Population: <strong>
                      {alliance.members.reduce((sum, m) => sum + m.population, 0).toLocaleString()}
                    </strong></span>
                    <span>|</span>
                    <span>Your Role: <strong className={getRoleBadgeClass(alliance.myRole || 'member')}>
                      {getRoleLabel(alliance.myRole || 'member')}
                    </strong></span>
                  </div>
                </div>

                <div className={styles.allianceActions}>
                  {canInvite() && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setShowInviteForm(!showInviteForm)}
                    >
                      {showInviteForm ? 'Cancel Invite' : 'Invite Player'}
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleLeaveAlliance}
                  >
                    Leave Alliance
                  </button>
                </div>
              </div>

              {/* Invite Form */}
              {showInviteForm && (
                <form onSubmit={handleInvitePlayer} className={styles.inviteForm}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Enter player username"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    required
                  />
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={isInviting}
                  >
                    {isInviting ? 'Inviting...' : 'Send Invite'}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Members List */}
          <div className="panel">
            <div className="panel-header">Members ({alliance.members.length})</div>
            <div className="panel-body">
              <div className={styles.membersTable}>
                <div className={styles.tableHeader}>
                  <div className={styles.colRank}>#</div>
                  <div className={styles.colPlayer}>Player</div>
                  <div className={styles.colTribe}>Tribe</div>
                  <div className={styles.colRole}>Role</div>
                  <div className={styles.colPopulation}>Population</div>
                  {(canKick(alliance.myRole || '') || canChangeRole()) && (
                    <div className={styles.colActions}>Actions</div>
                  )}
                </div>

                {alliance.members
                  .sort((a, b) => {
                    // Sort by role priority, then by population
                    const roleOrder = { founder: 0, leader: 1, officer: 2, member: 3 };
                    const roleA = roleOrder[a.role as keyof typeof roleOrder] ?? 4;
                    const roleB = roleOrder[b.role as keyof typeof roleOrder] ?? 4;
                    if (roleA !== roleB) return roleA - roleB;
                    return b.population - a.population;
                  })
                  .map((member, index) => (
                    <div key={member.userId} className={styles.memberRow}>
                      <div className={styles.colRank}>{index + 1}</div>
                      <div className={styles.colPlayer}>{member.username}</div>
                      <div className={styles.colTribe}>{member.tribe}</div>
                      <div className={styles.colRole}>
                        {canChangeRole() && member.role !== 'founder' ? (
                          <select
                            className={styles.roleSelect}
                            value={member.role}
                            onChange={(e) => handleChangeRole(member.userId, e.target.value)}
                            disabled={changingRole === member.userId}
                          >
                            <option value="member">Member</option>
                            <option value="officer">Officer</option>
                            <option value="leader">Leader</option>
                          </select>
                        ) : (
                          <span className={getRoleBadgeClass(member.role)}>
                            {getRoleLabel(member.role)}
                          </span>
                        )}
                      </div>
                      <div className={styles.colPopulation}>{member.population.toLocaleString()}</div>
                      {(canKick(alliance.myRole || '') || canChangeRole()) && (
                        <div className={styles.colActions}>
                          {canKick(member.role) && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleKickMember(member.userId, member.username)}
                            >
                              Kick
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Alliance Messages */}
          <div className="panel">
            <div className="panel-header">
              <div className={styles.sectionHeader}>
                <span>Alliance Messages</span>
                {canSendAllianceMessage() && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowMessageForm(!showMessageForm)}
                  >
                    {showMessageForm ? 'Cancel' : 'Send Message'}
                  </button>
                )}
              </div>
            </div>
            <div className="panel-body">
              {showMessageForm && (
                <form onSubmit={handleSendAllianceMessage} className={styles.messageForm}>
                  <div className="form-group">
                    <label className="form-label">Subject:</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Enter subject"
                      value={messageSubject}
                      onChange={(e) => setMessageSubject(e.target.value)}
                      maxLength={100}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Message:</label>
                    <textarea
                      className={styles.messageTextarea}
                      placeholder="Enter your message to all alliance members"
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      rows={6}
                      maxLength={5000}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={sendingMessage}>
                    {sendingMessage ? 'Sending...' : 'Send to All Members'}
                  </button>
                </form>
              )}

              <div className={styles.messagesList}>
                {allianceMessages.length === 0 ? (
                  <p className={styles.emptyText}>No alliance messages yet.</p>
                ) : (
                  allianceMessages.map((msg) => (
                    <div key={msg.id} className={styles.messageItem}>
                      <div className={styles.messageHeader}>
                        <span className={styles.messageSender}>
                          {msg.senderUsername}
                          <span className={getRoleBadgeClass(msg.senderRole)}>
                            {' '}({getRoleLabel(msg.senderRole)})
                          </span>
                        </span>
                        <span className={styles.messageDate}>
                          {new Date(msg.sentAt).toLocaleString()}
                        </span>
                      </div>
                      <div className={styles.messageSubject}>{msg.subject}</div>
                      <div className={styles.messageBody}>{msg.body}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Diplomacy */}
          <div className="panel">
            <div className="panel-header">
              <div className={styles.sectionHeader}>
                <span>Diplomacy</span>
                {canManageDiplomacy() && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowDiplomacyForm(!showDiplomacyForm)}
                  >
                    {showDiplomacyForm ? 'Cancel' : 'New Relation'}
                  </button>
                )}
              </div>
            </div>
            <div className="panel-body">
              {showDiplomacyForm && (
                <form onSubmit={handleProposeDiplomacy} className={styles.diplomacyForm}>
                  <div className="form-group">
                    <label className="form-label">Target Alliance ID:</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Enter alliance ID"
                      value={targetAllianceId}
                      onChange={(e) => setTargetAllianceId(e.target.value)}
                      required
                    />
                    <small className={styles.helpText}>
                      You can find alliance IDs by viewing their alliance page
                    </small>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Relation Type:</label>
                    <select
                      className="input"
                      value={relationType}
                      onChange={(e) => setRelationType(e.target.value as 'nap' | 'confederation' | 'war')}
                    >
                      <option value="nap">Non-Aggression Pact (NAP)</option>
                      <option value="confederation">Confederation</option>
                      <option value="war">War</option>
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={proposingDiplomacy}>
                    {proposingDiplomacy ? 'Processing...' : 'Propose Relation'}
                  </button>
                </form>
              )}

              <div className={styles.diplomacyList}>
                {diplomacy.length === 0 ? (
                  <p className={styles.emptyText}>No diplomatic relations.</p>
                ) : (
                  diplomacy.map((relation) => {
                    const isInitiator = relation.initiatorId === alliance?.id;
                    const otherAlliance = isInitiator ? relation.targetAlliance : relation.initiatorAlliance;
                    const isPending = relation.status === 'pending';
                    const canRespond = !isInitiator && isPending;

                    return (
                      <div key={relation.id} className={styles.diplomacyItem}>
                        <div className={styles.diplomacyHeader}>
                          <span
                            className={styles.relationType}
                            style={{ color: getRelationTypeColor(relation.relationType) }}
                          >
                            {getRelationTypeLabel(relation.relationType)}
                          </span>
                          <span className={styles.diplomacyStatus}>
                            {relation.status === 'pending' && '(Pending)'}
                            {relation.status === 'accepted' && '(Active)'}
                            {relation.status === 'rejected' && '(Rejected)'}
                          </span>
                        </div>
                        <div className={styles.diplomacyAlliance}>
                          <strong>{isInitiator ? 'With:' : 'From:'}</strong> [{otherAlliance.tag}] {otherAlliance.name}
                        </div>
                        <div className={styles.diplomacyDate}>
                          {new Date(relation.createdAt).toLocaleDateString()}
                        </div>
                        <div className={styles.diplomacyActions}>
                          {canRespond && (
                            <>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleAcceptDiplomacy(relation.id)}
                              >
                                Accept
                              </button>
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleRejectDiplomacy(relation.id)}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {canManageDiplomacy() && relation.status === 'accepted' && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleEndDiplomacy(relation.id)}
                            >
                              End Relation
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
