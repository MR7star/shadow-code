import { useState, useMemo } from 'react';
import { useProgression } from '../context/ProgressionContext';
import type { SkillWithState } from '../types';
import './SkillTree.css';

export default function SkillTree() {
  const { skillStates, refreshSkills } = useProgression();

  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const totalUnlocked = skillStates.filter((s) => s.level > 0).length;
  const totalMastered = skillStates.filter((s) => s.state === 'mastered').length;
  const totalPoints = skillStates.reduce((sum, s) => sum + s.level, 0);

  const selectedSkill = useMemo(
    () => skillStates.find((s) => s.id === selectedSkillId) || null,
    [skillStates, selectedSkillId]
  );

  const skillTreeRows = useMemo<SkillWithState[][]>(() => {
    const buildRow = (ids: string[]): SkillWithState[] =>
      ids.map((id) => skillStates.find((s) => s.id === id)).filter((s): s is SkillWithState => s !== undefined);

    return [
      buildRow(['skill-variables']),
      buildRow(['skill-control-flow']),
      buildRow(['skill-functions']),
      buildRow(['skill-arrays', 'skill-objects']),
      buildRow(['skill-stacks-queues', 'skill-linked-lists', 'skill-searching', 'skill-sorting', 'skill-dom']),
      buildRow(['skill-trees', 'skill-async']),
      buildRow(['skill-graphs']),
      buildRow(['skill-dp']),
    ];
  }, [skillStates]);

  return (
    <div className="skill-tree-page">
      <div className="skill-tree-page-header">
        <h1 className="skill-tree-page-title">Skill Tree</h1>
        <p className="skill-tree-page-desc">
          Learn concepts, prove mastery through challenges, and unlock skills to rise in rank.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="skill-summary stagger-children">
        <div className="skill-summary-card">
          <span className="skill-summary-icon">🔓</span>
          <div>
            <div className="skill-summary-value">{totalUnlocked}/{skillStates.length}</div>
            <div className="skill-summary-label">Skills Unlocked</div>
          </div>
        </div>
        <div className="skill-summary-card">
          <span className="skill-summary-icon">⭐</span>
          <div>
            <div className="skill-summary-value">{totalMastered}</div>
            <div className="skill-summary-label">Mastered</div>
          </div>
        </div>
        <div className="skill-summary-card">
          <span className="skill-summary-icon">💠</span>
          <div>
            <div className="skill-summary-value">{totalPoints}</div>
            <div className="skill-summary-label">Total Skill Points</div>
          </div>
        </div>
      </div>

      {/* Skill Tree */}
      <div className="skill-tree-container">
        <div className="skill-tree-nodes">
          {skillTreeRows.map((row, rowIdx) => (
            <div key={rowIdx} className="skill-tree-row">
              {row.map((skill) => {
                const state = skill.state;
                return (
                  <div
                    key={skill.id}
                    className={`skill-node ${state}`}
                    onClick={() => setSelectedSkillId(selectedSkillId === skill.id ? null : skill.id)}
                    onMouseEnter={() => setSelectedSkillId(skill.id)}
                    onMouseLeave={() => setSelectedSkillId(selectedSkillId === skill.id ? null : skill.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedSkillId(selectedSkillId === skill.id ? null : skill.id);
                      }
                    }}
                    aria-label={`${skill.name} — ${state} — level ${skill.level} / 5`}
                  >
                    <div className="skill-node-ring">
                      <span className="skill-node-icon">
                        {state === 'locked' ? '🔒' : state === 'mastered' ? '⭐' : skill.icon}
                      </span>
                    </div>
                    <span className="skill-node-name">{skill.name}</span>

                    {/* Level pips */}
                    <div className="skill-level-pips">
                      {Array.from({ length: skill.maxLevel }, (_, i) => (
                        <div
                          key={i}
                          className={`skill-pip ${i < skill.level ? 'filled' : ''} ${
                            skill.level >= skill.maxLevel ? 'max' : ''
                          }`}
                        />
                      ))}
                    </div>

                    {/* Lock reason */}
                    {state === 'locked' && skill.unlockReason && (
                      <div className="skill-lock-reason">{skill.unlockReason}</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Skill Detail Panel */}
      {selectedSkill && (
        <div className="skill-detail-panel">
          <button
            type="button"
            className="skill-detail-close"
            onClick={() => setSelectedSkillId(null)}
            aria-label="Close skill details"
          >
            ✕
          </button>
          <div className="skill-detail-header">
            <div className="skill-detail-icon">{selectedSkill.icon}</div>
            <div>
              <h2 className="skill-detail-name">{selectedSkill.name}</h2>
              <div className="skill-detail-meta">
                <span className={`skill-detail-state skill-detail-state-${selectedSkill.state}`}>
                  {selectedSkill.state.charAt(0).toUpperCase() + selectedSkill.state.slice(1)}
                </span>
                <span className="skill-detail-category">
                  {selectedSkill.category.replace(/-/g, ' ')}
                </span>
              </div>
            </div>
          </div>

          <div className="skill-detail-body">
            <p className="skill-detail-desc">{selectedSkill.description}</p>

            <div className="skill-detail-meta-row">
              <div className="skill-detail-meta-item">
                <span className="skill-detail-meta-label">Level</span>
                <span className="skill-detail-meta-value">
                  {selectedSkill.level} / {selectedSkill.maxLevel}
                </span>
              </div>
              {selectedSkill.conceptId && (
                <div className="skill-detail-meta-item">
                  <span className="skill-detail-meta-label">Concept Mastery</span>
                  <span className="skill-detail-meta-value">
                    {selectedSkill.conceptMasteryLevel} / 5
                  </span>
                </div>
              )}
            </div>

            {/* Prerequisites */}
            {selectedSkill.prerequisiteIds && selectedSkill.prerequisiteIds.length > 0 && (
              <div className="skill-detail-section">
                <h3 className="skill-detail-section-title">Prerequisite Skills</h3>
                <div className="skill-detail-prereq-list">
                  {selectedSkill.prerequisiteIds.map((pid) => {
                    const prereq = skillStates.find((s) => s.id === pid);
                    const met = prereq ? prereq.level > 0 : false;
                    return (
                      <div
                        key={pid}
                        className={`skill-detail-prereq ${met ? 'met' : 'unmet'}`}
                      >
                        {met ? '✓' : '✗'} {prereq?.name || pid}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unlock reason */}
            {selectedSkill.state === 'locked' && selectedSkill.unlockReason && (
              <div className="skill-detail-section skill-detail-locked">
                <h3 className="skill-detail-section-title">Why is this locked?</h3>
                <p>{selectedSkill.unlockReason}</p>
              </div>
            )}

            {/* Mastery path */}
            {selectedSkill.conceptId && (
              <div className="skill-detail-section">
                <h3 className="skill-detail-section-title">Mastery Path</h3>
                <p>
                  Complete challenges related to <strong>{selectedSkill.conceptId}</strong> to level up this
                  skill. Your skill level cannot exceed your concept mastery level for this area.
                </p>
                {(selectedSkill.conceptMasteryLevel ?? 0) > 0 && (
                  <div className="skill-detail-mastery-bar">
                    <div className="skill-detail-mastery-fill" style={{ width: `${((selectedSkill.conceptMasteryLevel ?? 0) / 5) * 100}%` }} />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="skill-detail-actions">
            <button
              type="button"
              className="skill-detail-btn skill-detail-btn-secondary"
              onClick={() => setSelectedSkillId(null)}
            >
              Back
            </button>
            {selectedSkill.state === 'available' && (
              <button
                type="button"
                className="skill-detail-btn skill-detail-btn-primary"
                onClick={() => {
                  void refreshSkills();
                  setSelectedSkillId(null);
                }}
              >
                Start Learning
              </button>
            )}
          </div>
        </div>
      )}

      <div className="skill-tree-progress-bar">
        <div
          className="skill-tree-progress-fill"
          style={{ width: `${Math.min(100, (totalMastered / skillStates.length) * 100)}%` }}
        />
      </div>
      <div className="skill-tree-progress-label">
        {totalMastered}/{skillStates.length} skills mastered
      </div>
    </div>
  );
}
