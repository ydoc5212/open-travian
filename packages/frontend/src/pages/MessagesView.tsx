import { useState, useEffect } from 'react';
import { messagesApi } from '../services/api';
import styles from './MessagesView.module.css';

interface Message {
  id: string;
  senderId?: string;
  senderUsername?: string;
  senderAllianceTag?: string | null;
  recipientId?: string;
  recipientUsername?: string;
  recipientAllianceTag?: string | null;
  subject: string;
  body: string;
  read: boolean;
  sentAt: string;
}

type TabType = 'inbox' | 'outbox' | 'compose';

export function MessagesView() {
  const [activeTab, setActiveTab] = useState<TabType>('inbox');
  const [inboxMessages, setInboxMessages] = useState<Message[]>([]);
  const [outboxMessages, setOutboxMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Compose form state
  const [recipientUsername, setRecipientUsername] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadMessages();
  }, []);

  async function loadMessages() {
    try {
      setLoading(true);
      setError(null);
      const [inboxResponse, outboxResponse] = await Promise.all([
        messagesApi.getInbox(),
        messagesApi.getOutbox(),
      ]);
      setInboxMessages(inboxResponse.data.messages);
      setOutboxMessages(outboxResponse.data.messages);
    } catch (err: any) {
      setError(err.message || 'Failed to load messages');
      console.error('Error loading messages:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleMessageClick(message: Message) {
    setSelectedMessage(message);

    // Mark as read if it's an inbox message and not already read
    if (activeTab === 'inbox' && !message.read) {
      try {
        await messagesApi.markRead(message.id);
        setInboxMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...m, read: true } : m))
        );
      } catch (err) {
        console.error('Error marking message as read:', err);
      }
    }
  }

  async function handleDeleteMessage(messageId: string, event: React.MouseEvent) {
    event.stopPropagation();

    if (!confirm('Are you sure you want to delete this message?')) {
      return;
    }

    try {
      await messagesApi.delete(messageId);
      setInboxMessages((prev) => prev.filter((m) => m.id !== messageId));
      setOutboxMessages((prev) => prev.filter((m) => m.id !== messageId));
      if (selectedMessage?.id === messageId) {
        setSelectedMessage(null);
      }
      setSuccess('Message deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete message');
      console.error('Error deleting message:', err);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      await messagesApi.send(recipientUsername, subject, body);
      setSuccess('Message sent successfully!');
      setRecipientUsername('');
      setSubject('');
      setBody('');
      setActiveTab('outbox');
      await loadMessages();
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  function handleReply(message: Message) {
    setRecipientUsername(message.senderUsername || '');
    setSubject(`Re: ${message.subject}`);
    setBody(`\n\n--- Original Message ---\nFrom: ${message.senderUsername}\n${message.body}`);
    setActiveTab('compose');
    setSelectedMessage(null);
  }

  function handleBackToList() {
    setSelectedMessage(null);
  }

  const currentMessages = activeTab === 'inbox' ? inboxMessages : outboxMessages;
  const unreadCount = inboxMessages.filter((m) => !m.read).length;

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading messages...</div>
      </div>
    );
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

      <div className="panel">
        <div className="panel-header">
          <div className={styles.header}>
            <span>Messages</span>
            {unreadCount > 0 && (
              <span className={styles.unreadBadge}>{unreadCount} unread</span>
            )}
          </div>
        </div>

        <div className="panel-body">
          {/* Tabs */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'inbox' ? styles.tabActive : ''}`}
              onClick={() => {
                setActiveTab('inbox');
                setSelectedMessage(null);
              }}
            >
              Inbox ({inboxMessages.length})
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'outbox' ? styles.tabActive : ''}`}
              onClick={() => {
                setActiveTab('outbox');
                setSelectedMessage(null);
              }}
            >
              Outbox ({outboxMessages.length})
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'compose' ? styles.tabActive : ''}`}
              onClick={() => {
                setActiveTab('compose');
                setSelectedMessage(null);
              }}
            >
              Compose
            </button>
          </div>

          {/* Message List or Detail */}
          {activeTab === 'compose' ? (
            <form onSubmit={handleSendMessage} className={styles.composeForm}>
              <div className="form-group">
                <label className="form-label">To (username):</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter recipient username"
                  value={recipientUsername}
                  onChange={(e) => setRecipientUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Subject:</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Message:</label>
                <textarea
                  className={styles.messageBody}
                  placeholder="Enter your message"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  maxLength={5000}
                  required
                />
              </div>

              <div className={styles.composeActions}>
                <button type="submit" className="btn btn-primary" disabled={sending}>
                  {sending ? 'Sending...' : 'Send Message'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setRecipientUsername('');
                    setSubject('');
                    setBody('');
                  }}
                >
                  Clear
                </button>
              </div>
            </form>
          ) : selectedMessage ? (
            <div className={styles.messageDetail}>
              <div className={styles.messageDetailHeader}>
                <button className="btn btn-secondary btn-sm" onClick={handleBackToList}>
                  ← Back to List
                </button>
                <div className={styles.messageDetailActions}>
                  {activeTab === 'inbox' && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleReply(selectedMessage)}
                    >
                      Reply
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={(e) => handleDeleteMessage(selectedMessage.id, e)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className={styles.messageDetailContent}>
                <div className={styles.messageDetailMeta}>
                  <div>
                    <strong>
                      {activeTab === 'inbox' ? 'From:' : 'To:'}
                    </strong>{' '}
                    {activeTab === 'inbox' ? (
                      <>
                        {selectedMessage.senderUsername}
                        {selectedMessage.senderAllianceTag && (
                          <span className={styles.allianceTag}>
                            [{selectedMessage.senderAllianceTag}]
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        {selectedMessage.recipientUsername}
                        {selectedMessage.recipientAllianceTag && (
                          <span className={styles.allianceTag}>
                            [{selectedMessage.recipientAllianceTag}]
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <strong>Date:</strong>{' '}
                    {new Date(selectedMessage.sentAt).toLocaleString()}
                  </div>
                </div>

                <div className={styles.messageDetailSubject}>
                  <strong>Subject:</strong> {selectedMessage.subject}
                </div>

                <div className={styles.messageDetailBody}>
                  {selectedMessage.body}
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.messageList}>
              {currentMessages.length === 0 ? (
                <div className={styles.emptyState}>
                  No messages in {activeTab}
                </div>
              ) : (
                currentMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`${styles.messageItem} ${
                      activeTab === 'inbox' && !message.read ? styles.messageUnread : ''
                    }`}
                    onClick={() => handleMessageClick(message)}
                  >
                    <div className={styles.messageItemHeader}>
                      <div className={styles.messageItemUser}>
                        {activeTab === 'inbox' ? (
                          <>
                            {message.senderUsername}
                            {message.senderAllianceTag && (
                              <span className={styles.allianceTag}>
                                [{message.senderAllianceTag}]
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {message.recipientUsername}
                            {message.recipientAllianceTag && (
                              <span className={styles.allianceTag}>
                                [{message.recipientAllianceTag}]
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      <div className={styles.messageItemDate}>
                        {new Date(message.sentAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className={styles.messageItemSubject}>
                      {activeTab === 'inbox' && !message.read && (
                        <span className={styles.newIndicator}>NEW</span>
                      )}
                      {message.subject}
                    </div>
                    <div className={styles.messageItemActions}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => handleDeleteMessage(message.id, e)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
