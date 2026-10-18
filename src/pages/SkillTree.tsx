import { useState, useMemo } from 'react';
import { useProgression } from '../context/ProgressionContext';
import type { Skill } from '../types';
import './SkillTree.css';

function getNodeState(skill: Skill): 'locked' | 'unlocked' | 'mastered' {
  if (skill.level === 0) return 'locked';
  if (skill.level >= skill.maxLevel) return 'mastered';
  return 'unlocked';
}

export default function SkillTree() {
  const { skills } = useProgression();
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);

  // Organize skills into visual rows for the tree layout
  const treeRows = useMemo<Skill[][]>(() => [
    skills.filter((s) => s.id === 'skill-variables'),
    skills.filter((s) => s.id === 'skill-control-flow'),
    skills.filter((s) => s.id === 'skill-functions'),
    skills.filter((s) =>
      ['skill-arrays', 'skill-objects'].includes(s.id)
    ),
    skills.filter((s) =>
      ['skill-stacks-queues', 'skill-linked-lists', 'skill-searching', 'skill-sorting', 'skill-dom'].includes(s.id)
    ),
    skills.filter((s) =>
      ['skill-trees', 'skill-async'].includes(s.id)
    ),
    skills.filter((s) => s.id === 'skill-graphs'),
    skills.filter((s) => s.id === 'skill-dp'),
  ], [skills]);

  const totalUnlocked = skills.filter((s) => s.level > 0).length;
  const totalMastered = skills.filter((s) => s.level >= s.maxLevel).length;
  const totalPoints = skills.reduce((sum, s) => sum + s.level, 0);

  return (
    <div className="skill-tree-page">
      <div className="skill-tree-page-header">
        <h1 className="skill-tree-page-title">Skill Tree</h1>
        <p className="skill-tree-page-desc">
          Unlock and level up skills as you complete quests. Master all skills to become a Monarch.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="skill-summary stagger-children">
        <div className="skill-summary-card">
          <span className="skill-summary-icon">🔓</span>
          <div>
            <div className="skill-summary-value">{totalUnlocked}/{skills.length}</div>
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
          {treeRows.map((row, rowIdx) => (
            <div key={rowIdx} className="skill-tree-row">
              {row.map((skill) => {
                const state = getNodeState(skill);
                return (
                  <div
                    key={skill.id}
                    className={`skill-node ${state}`}
                    onMouseEnter={() => setHoveredSkill(skill.id)}
                    onMouseLeave={() => setHoveredSkill(null)}
                  >
                    <div className="skill-node-ring">
                      <span className="skill-node-icon">
                        {state === 'locked' ? '🔒' : skill.icon}
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

                    {/* Tooltip */}
                    {hoveredSkill === skill.id && (
                      <div className="skill-tooltip">
                        <div className="skill-tooltip-name">{skill.name}</div>
                        <div className="skill-tooltip-desc">{skill.description}</div>
                        <div className="skill-tooltip-level">
                          Level {skill.level} / {skill.maxLevel}
                        </div>
                        <div className="skill-tooltip-category">
                          {skill.category.replace(/-/g, ' ')}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
