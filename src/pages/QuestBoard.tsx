import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgression } from '../context/ProgressionContext';
import { useAuth } from '../context/AuthContext';
import type { QuestDifficulty, QuestStatus } from '../types';
import './QuestBoard.css';

const statusFilters = [
  { key: 'all', label: 'All Quests' },
  { key: 'available', label: 'Available' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'locked', label: 'Locked' },
];

const difficultyOptions: { value: string; label: string }[] = [
  { value: 'all', label: 'All Difficulties' },
  { value: 'E', label: 'E-Rank (Beginner)' },
  { value: 'D', label: 'D-Rank (Apprentice)' },
  { value: 'C', label: 'C-Rank (Intermediate)' },
  { value: 'B', label: 'B-Rank (Advanced)' },
  { value: 'A', label: 'A-Rank (Expert)' },
  { value: 'S', label: 'S-Rank (Master)' },
];

const topicOptions: { value: string; label: string }[] = [
  { value: 'all', label: 'All Topics' },
  { value: 'fundamentals', label: 'Fundamentals' },
  { value: 'data-structures', label: 'Data Structures' },
  { value: 'algorithms', label: 'Algorithms' },
  { value: 'web-dev', label: 'Web Development' },
  { value: 'databases', label: 'Databases' },
  { value: 'system-design', label: 'System Design' },
];

function getRankColor(difficulty: QuestDifficulty): string {
  const map: Record<QuestDifficulty, string> = {
    E: 'var(--rank-e)',
    D: 'var(--rank-d)',
    C: 'var(--rank-c)',
    B: 'var(--rank-b)',
    A: 'var(--rank-a)',
    S: 'var(--rank-s)',
  };
  return map[difficulty] || 'var(--text-muted)';
}

function getStatusStyle(status: QuestStatus) {
  switch (status) {
    case 'completed':
      return { background: 'rgba(16, 185, 129, 0.12)', color: 'var(--color-success)', border: '1px solid rgba(16, 185, 129, 0.25)' };
    case 'in-progress':
      return { background: 'rgba(245, 158, 11, 0.12)', color: 'var(--color-warning)', border: '1px solid rgba(245, 158, 11, 0.25)' };
    case 'available':
      return { background: 'var(--accent-primary-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--border-default)' };
    case 'locked':
      return { background: 'rgba(107, 101, 128, 0.12)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' };
  }
}

function formatCategory(cat: string): string {
  return cat.replace(/-/g, ' ');
}

interface ToastState {
  title: string;
  desc: string;
  icon: string;
}

export default function QuestBoard() {
  const navigate = useNavigate();
  const { quests, startQuest, completeQuest, isQuestClaimed } = useProgression();
  const { isAuthenticated, openAuthModal } = useAuth();

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStatus, setActiveStatus] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');

  // Modal detail view state
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);

  // Toast feedback state
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedQuestId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Exclude daily quests from the main board
  const mainQuests = useMemo(() => quests.filter((q) => !q.isDaily), [quests]);

  // Find active selected quest from live quests list
  const selectedQuest = useMemo(() => {
    if (!selectedQuestId) return null;
    return quests.find((q) => q.id === selectedQuestId) || null;
  }, [selectedQuestId, quests]);

  // Filtered quests
  const filtered = useMemo(() => {
    return mainQuests.filter((quest) => {
      // Status filter
      if (activeStatus !== 'all' && quest.status !== activeStatus) {
        return false;
      }
      // Difficulty filter
      if (selectedDifficulty !== 'all' && quest.difficulty !== selectedDifficulty) {
        return false;
      }
      // Topic filter
      if (selectedTopic !== 'all' && quest.category !== selectedTopic) {
        return false;
      }
      // Search filter
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = quest.title.toLowerCase().includes(query);
        const matchesDesc = quest.description.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc) {
          return false;
        }
      }
      return true;
    });
  }, [mainQuests, activeStatus, selectedDifficulty, selectedTopic, searchQuery]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    activeStatus !== 'all' ||
    selectedDifficulty !== 'all' ||
    selectedTopic !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setActiveStatus('all');
    setSelectedDifficulty('all');
    setSelectedTopic('all');
  };

  const handleStartQuest = (questId: string) => {
    const success = startQuest(questId);
    if (success) {
      const q = quests.find((item) => item.id === questId);
      setToast({
        title: '⚔️ Quest Started!',
        desc: `"${q?.title}" is now In Progress. Complete objectives to earn XP.`,
        icon: '⚔️',
      });
    }
  };

  const handleCompleteQuest = (questId: string) => {
    if (isAuthenticated) {
      setToast({
        title: 'Server-authoritative rewards',
        desc: 'Sign-in progress is saved only when a passing solution is submitted in the Python IDE.',
        icon: '🛡️',
      });
      navigate(`/quest/${questId}`);
      return;
    }

    const result = completeQuest(questId);
    const q = quests.find((item) => item.id === questId);

    if (result.success) {
      if (result.leveledUp) {
        setToast({
          title: `⚡ LEVEL UP! (Level ${result.newLevel})`,
          desc: `Completed "${q?.title}"! Gained +${result.xpGained} XP! Rank updated!`,
          icon: '👑',
        });
      } else if (result.xpGained > 0) {
        setToast({
          title: '✨ Quest Completed!',
          desc: `Gained +${result.xpGained} XP from "${q?.title}"! Progress saved.`,
          icon: '💎',
        });
      } else {
        setToast({
          title: '✓ Quest Completed',
          desc: `"${q?.title}" marked as completed. (XP was already awarded previously)`,
          icon: 'ℹ️',
        });
      }
    }
  };

  return (
    <div className="quest-board">
      {/* Header */}
      <div className="quest-board-header">
        <h1 className="quest-board-title">Quest Board</h1>
        <p className="quest-board-desc">
          Select a quest to inspect objectives, prerequisites, and rewards. Complete quests to level up and awaken new skills.
        </p>
      </div>

      {/* Search and Filters Controls */}
      <div className="quest-controls-panel">
        {/* Search input */}
        <div className="quest-search-wrap">
          <span className="quest-search-icon">🔍</span>
          <input
            type="text"
            className="quest-search-input"
            placeholder="Search quests by title or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="quest-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter dropdowns and reset */}
        <div className="quest-filter-row">
          <div className="quest-filter-group">
            <span className="quest-filter-label">Difficulty:</span>
            <select
              className="quest-select"
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
            >
              {difficultyOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="quest-filter-group">
            <span className="quest-filter-label">Topic:</span>
            <select
              className="quest-select"
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
            >
              {topicOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button className="quest-reset-filters-btn" onClick={resetFilters}>
              Reset Filters ↺
            </button>
          )}
        </div>

        {/* Status Pills */}
        <div className="quest-status-pills">
          {statusFilters.map((f) => {
            const count =
              f.key === 'all'
                ? mainQuests.length
                : mainQuests.filter((q) => q.status === f.key).length;

            return (
              <button
                key={f.key}
                className={`quest-filter-btn ${activeStatus === f.key ? 'active' : ''}`}
                onClick={() => setActiveStatus(f.key)}
              >
                {f.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Quest Grid */}
      {filtered.length === 0 ? (
        <div className="panel" style={{ padding: '56px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '14px' }}>🔍</div>
          <div style={{ color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px' }}>
            No quests match your criteria
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '18px' }}>
            Try adjusting your search query, difficulty, or topic filter.
          </div>
          <button className="quest-btn quest-btn-secondary" onClick={resetFilters}>
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="quest-grid stagger-children">
          {filtered.map((quest) => (
            <div
              key={quest.id}
              className={`quest-card ${quest.status}`}
              onClick={() => setSelectedQuestId(quest.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedQuestId(quest.id);
                }
              }}
            >
              <div className="quest-card-top">
                <div className="quest-card-badges">
                  <div
                    className="quest-difficulty"
                    style={{
                      background: `${getRankColor(quest.difficulty)}18`,
                      color: getRankColor(quest.difficulty),
                      border: `1px solid ${getRankColor(quest.difficulty)}44`,
                    }}
                  >
                    {quest.difficulty}
                  </div>
                  <span className="quest-category">{formatCategory(quest.category)}</span>
                </div>
                <span className="quest-status-badge" style={getStatusStyle(quest.status)}>
                  {quest.status === 'in-progress' ? 'In Progress' : quest.status}
                </span>
              </div>

              <h3 className="quest-card-title">
                {quest.status === 'locked' && '🔒 '}
                {quest.title}
              </h3>
              <p className="quest-card-desc">{quest.description}</p>

              {/* Objectives preview */}
              <div className="quest-objectives">
                {quest.objectives.slice(0, 3).map((obj, i) => (
                  <div key={i} className="quest-objective">
                    <span className="quest-objective-dot" />
                    {obj}
                  </div>
                ))}
                {quest.objectives.length > 3 && (
                  <div className="quest-objective" style={{ color: 'var(--text-accent)' }}>
                    +{quest.objectives.length - 3} more tasks
                  </div>
                )}
              </div>

              <div className="quest-card-footer">
                <div className="quest-card-meta">
                  <div className="quest-meta-item">
                    ⏱️ <span className="quest-meta-value">{quest.estimatedMinutes}m</span>
                  </div>
                  <div className="quest-meta-item">
                    📋 <span className="quest-meta-value">{quest.objectives.length} tasks</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="quest-xp-reward">+{quest.xpReward} XP</span>
                  <button
                    type="button"
                    className="quest-btn quest-btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/quest/${quest.id}`);
                    }}
                    title="Open in Python challenge solver"
                  >
                    🐍 Code
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quest Detail Modal View */}
      {selectedQuest && (
        <div
          className="quest-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedQuestId(null);
            }
          }}
        >
          <div className="quest-modal" role="dialog" aria-modal="true">
            {/* Header */}
            <div className="quest-modal-header">
              <button
                className="quest-modal-close"
                onClick={() => setSelectedQuestId(null)}
                aria-label="Close quest details"
              >
                ✕
              </button>

              <div className="quest-card-badges">
                <div
                  className="quest-difficulty"
                  style={{
                    background: `${getRankColor(selectedQuest.difficulty)}22`,
                    color: getRankColor(selectedQuest.difficulty),
                    border: `1px solid ${getRankColor(selectedQuest.difficulty)}55`,
                    width: '32px',
                    height: '32px',
                    fontSize: '0.85rem',
                  }}
                >
                  {selectedQuest.difficulty}
                </div>
                <span className="quest-category">{formatCategory(selectedQuest.category)}</span>
                <span className="quest-status-badge" style={getStatusStyle(selectedQuest.status)}>
                  {selectedQuest.status === 'in-progress' ? 'In Progress' : selectedQuest.status}
                </span>
              </div>

              <h2 className="quest-modal-title">{selectedQuest.title}</h2>
            </div>

            {/* Body */}
            <div className="quest-modal-body">
              <p className="quest-modal-desc">{selectedQuest.description}</p>

              {/* Detail Info Grid */}
              <div className="quest-detail-grid">
                <div className="quest-detail-item">
                  <span className="quest-detail-label">Difficulty</span>
                  <span
                    className="quest-detail-value"
                    style={{ color: getRankColor(selectedQuest.difficulty) }}
                  >
                    Rank {selectedQuest.difficulty}
                  </span>
                </div>
                <div className="quest-detail-item">
                  <span className="quest-detail-label">Topic</span>
                  <span className="quest-detail-value" style={{ textTransform: 'capitalize' }}>
                    {formatCategory(selectedQuest.category)}
                  </span>
                </div>
                <div className="quest-detail-item">
                  <span className="quest-detail-label">Est. Time</span>
                  <span className="quest-detail-value">{selectedQuest.estimatedMinutes} mins</span>
                </div>
                <div className="quest-detail-item">
                  <span className="quest-detail-label">XP Reward</span>
                  <span className="quest-detail-value" style={{ color: 'var(--accent-cyan)' }}>
                    +{selectedQuest.xpReward} XP
                  </span>
                </div>
              </div>

              {/* Prerequisites */}
              <div>
                <div className="quest-modal-section-title">
                  <span>⛓️</span> Prerequisites
                </div>
                {selectedQuest.prerequisiteIds.length === 0 ? (
                  <div className="quest-prereq-item">
                    <span className="quest-prereq-name">None — Entry Level Quest</span>
                    <span className="quest-prereq-status done">✓ Unlocked</span>
                  </div>
                ) : (
                  <div className="quest-prereq-list">
                    {selectedQuest.prerequisiteIds.map((pid) => {
                      const prereq = quests.find((q) => q.id === pid);
                      const isCompleted = prereq && prereq.status === 'completed';
                      return (
                        <div key={pid} className="quest-prereq-item">
                          <span className="quest-prereq-name">
                            {prereq ? prereq.title : pid}
                          </span>
                          <span
                            className={`quest-prereq-status ${isCompleted ? 'done' : 'pending'}`}
                          >
                            {isCompleted ? '✓ Completed' : '🔒 Incomplete'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Objectives */}
              <div>
                <div className="quest-modal-section-title">
                  <span>📋</span> Objectives ({selectedQuest.objectives.length})
                </div>
                <div className="quest-modal-objectives">
                  {selectedQuest.objectives.map((obj, i) => (
                    <div key={i} className="quest-modal-objective">
                      <span className="quest-modal-objective-icon">
                        {selectedQuest.status === 'completed' ? '✅' : '🎯'}
                      </span>
                      <span>{obj}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Interactive Python Note */}
              <div className="quest-disclaimer-box">
                🐍 <strong>Interactive Python Quest:</strong> You can launch the live Python IDE to write, test, and evaluate your code with genuine server-side hidden test cases, or mark completed directly.
              </div>
            </div>

            {/* Footer Actions */}
            <div className="quest-modal-footer">
              <button
                className="quest-btn quest-btn-secondary"
                onClick={() => setSelectedQuestId(null)}
              >
                Close
              </button>

              <button
                className="quest-btn quest-btn-primary"
                style={{
                  background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                  boxShadow: '0 0 16px rgba(6, 182, 212, 0.4)',
                }}
                onClick={() => navigate(`/quest/${selectedQuest.id}`)}
              >
                🐍 Solve in Python IDE
              </button>

              {selectedQuest.status === 'locked' && (
                <button className="quest-btn quest-btn-disabled" disabled>
                  🔒 Prerequisites Required
                </button>
              )}

              {selectedQuest.status === 'available' && (
                <>
                  <button
                    className="quest-btn quest-btn-secondary"
                    onClick={() => handleStartQuest(selectedQuest.id)}
                  >
                    Start Quest
                  </button>
                  <button
                    className="quest-btn quest-btn-primary"
                    onClick={() =>
                      isAuthenticated
                        ? handleCompleteQuest(selectedQuest.id)
                        : openAuthModal()
                    }
                  >
                    {isAuthenticated
                      ? `Submit in IDE (+${selectedQuest.xpReward} XP)`
                      : 'Sign in to save XP'}
                  </button>
                </>
              )}

              {selectedQuest.status === 'in-progress' && (
                <button
                  className="quest-btn quest-btn-primary"
                  onClick={() => handleCompleteQuest(selectedQuest.id)}
                >
                  {isAuthenticated
                    ? `Submit in IDE (+${selectedQuest.xpReward} XP)`
                    : `Preview complete (+${selectedQuest.xpReward} XP)`}
                </button>
              )}

              {selectedQuest.status === 'completed' && (
                <button
                  className="quest-btn quest-btn-success"
                  onClick={() => handleCompleteQuest(selectedQuest.id)}
                  title="Clicking again will not award duplicate XP"
                >
                  ✓ Completed {isQuestClaimed(selectedQuest.id) ? '(Rewards Claimed)' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast notification */}
      {toast && (
        <div className="quest-toast" role="alert">
          <span className="quest-toast-icon">{toast.icon}</span>
          <div className="quest-toast-text">
            <span className="quest-toast-title">{toast.title}</span>
            <span className="quest-toast-desc">{toast.desc}</span>
          </div>
        </div>
      )}
    </div>
  );
}
