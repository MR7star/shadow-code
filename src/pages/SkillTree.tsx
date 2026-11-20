import { useState, useEffect, useMemo, useLayoutEffect, useRef } from 'react';
import { useProgression } from '../context/ProgressionContext';
import { EmptyState, ErrorState, LoadingState } from '../components/ui';
import { AppIcon } from '../components/ui/AppIcon';
import './SkillTree.css';

interface ConnectorPoint {
  x: number;
  y: number;
}

const SKILL_TREE_CANVAS_WIDTH = 1200;
const SKILL_TREE_CANVAS_HEIGHT = 1920;
const SKILL_TREE_NODE_POSITIONS: Record<string, ConnectorPoint> = {
  'skill-variables': { x: 600, y: 100 },
  'skill-control-flow': { x: 600, y: 330 },
  'skill-functions': { x: 600, y: 560 },
  'skill-arrays': { x: 385, y: 800 },
  'skill-objects': { x: 815, y: 800 },
  'skill-stacks-queues': { x: 175, y: 1050 },
  'skill-linked-lists': { x: 390, y: 1050 },
  'skill-searching': { x: 605, y: 1050 },
  'skill-sorting': { x: 820, y: 1050 },
  'skill-dom': { x: 1035, y: 1050 },
  'skill-trees': { x: 500, y: 1300 },
  'skill-async': { x: 1035, y: 1300 },
  'skill-graphs': { x: 500, y: 1550 },
  'skill-dp': { x: 500, y: 1780 },
};

function roundSkillCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export default function SkillTree() {
  const { skillStates, skillProgressionRequest, refreshSkills } = useProgression();

  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [hoveredSkillId, setHoveredSkillId] = useState<string | null>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const treeViewportRef = useRef<HTMLDivElement>(null);
  const [connectors, setConnectors] = useState<Array<{ id: string; path: string; active: boolean }>>([]);

  useEffect(() => {
    void refreshSkills();
  }, [refreshSkills]);

  const totalUnlocked = skillStates.filter((s) => s.level > 0).length;
  const totalMastered = skillStates.filter((s) => s.state === 'mastered').length;
  const totalPoints = skillStates.reduce((sum, s) => sum + s.level, 0);
  const selectedSkill = useMemo(
    () => skillStates.find((s) => s.id === selectedSkillId) || null,
    [skillStates, selectedSkillId]
  );
  const hoveredSkill = useMemo(
    () => skillStates.find((s) => s.id === hoveredSkillId) || null,
    [skillStates, hoveredSkillId]
  );
  const displayedSkill = selectedSkill ?? hoveredSkill;
  const displayedConceptMastery = Math.min(5, Math.max(0, displayedSkill?.conceptMasteryLevel ?? 0));
  const masteredPercentage = skillStates.length > 0
    ? Math.min(100, (totalMastered / skillStates.length) * 100)
    : 0;
  const treeVisible = skillProgressionRequest.status === 'preview' || skillProgressionRequest.status === 'success';

  useEffect(() => {
    if (skillProgressionRequest.status !== 'preview' && skillProgressionRequest.status !== 'success') {
      setSelectedSkillId(null);
      setHoveredSkillId(null);
    }
  }, [skillProgressionRequest.status]);

  const activateSkill = (skillId: string) => {
    if (selectedSkillId === skillId) {
      setSelectedSkillId(null);
      setHoveredSkillId(null);
    } else {
      setSelectedSkillId(skillId);
    }
  };

  useLayoutEffect(() => {
    const canvas = treeContainerRef.current;
    const viewport = treeViewportRef.current;
    if (!canvas || !viewport) return;

    let active = true;
    let frameId = 0;
    const svg = canvas.querySelector<SVGSVGElement>('svg.skill-tree-svg');
    if (!svg) return;

    const updateConnectors = () => {
      if (!active) return;
      const width = svg.clientWidth;
      const height = svg.clientHeight;
      const matrix = svg.getScreenCTM();
      if (width <= 0 || height <= 0 || !matrix) return;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const inverse = matrix.inverse();
      const toSvgPoint = (x: number, y: number): ConnectorPoint => {
        const point = svg.createSVGPoint();
        point.x = x;
        point.y = y;
        const transformed = point.matrixTransform(inverse);
        return { x: roundSkillCoordinate(transformed.x), y: roundSkillCoordinate(transformed.y) };
      };
      const anchors = new Map<string, { left: number; top: number; right: number; bottom: number }>();
      canvas.querySelectorAll<HTMLElement>('[data-skill-anchor]').forEach((element) => {
        const id = element.dataset.skillAnchor;
        if (!id) return;
        const rect = element.getBoundingClientRect();
        const corners = [
          toSvgPoint(rect.left, rect.top),
          toSvgPoint(rect.right, rect.top),
          toSvgPoint(rect.right, rect.bottom),
          toSvgPoint(rect.left, rect.bottom),
        ];
        anchors.set(id, {
          left: Math.min(...corners.map((point) => point.x)),
          top: Math.min(...corners.map((point) => point.y)),
          right: Math.max(...corners.map((point) => point.x)),
          bottom: Math.max(...corners.map((point) => point.y)),
        });
      });

      interface Dependency {
        id: string;
        sourceId: string;
        targetId: string;
        sourceIndex: number;
        sourceCount: number;
        targetIndex: number;
        targetCount: number;
        active: boolean;
      }
      const dependencies: Dependency[] = [];
      const seen = new Set<string>();
      for (const skill of skillStates) {
        const prerequisites = Array.from(new Set(skill.prerequisiteIds)).filter((id) => id !== skill.id && anchors.has(id));
        for (const [targetIndex, sourceId] of prerequisites.entries()) {
          const id = `${sourceId}->${skill.id}`;
          if (seen.has(id)) continue;
          seen.add(id);
          dependencies.push({
            id,
            sourceId,
            targetId: skill.id,
            sourceIndex: 0,
            sourceCount: 0,
            targetIndex,
            targetCount: prerequisites.length,
            active: (skillStates.find((candidate) => candidate.id === sourceId)?.level ?? 0) > 0,
          });
        }
      }
      const outgoing = new Map<string, Dependency[]>();
      for (const dependency of dependencies) {
        const edges = outgoing.get(dependency.sourceId) ?? [];
        edges.push(dependency);
        outgoing.set(dependency.sourceId, edges);
      }
      for (const edges of outgoing.values()) {
        edges.forEach((edge, index) => {
          edge.sourceIndex = index;
          edge.sourceCount = edges.length;
        });
      }

      const nextConnectors = dependencies.flatMap((dependency) => {
        const source = anchors.get(dependency.sourceId);
        const target = anchors.get(dependency.targetId);
        if (!source || !target || target.top <= source.bottom) return [];
        const sourceOffset = (dependency.sourceIndex - (dependency.sourceCount - 1) / 2) * 14;
        const targetOffset = (dependency.targetIndex - (dependency.targetCount - 1) / 2) * 14;
        const sourceX = Math.max(source.left + 18, Math.min(source.right - 18, (source.left + source.right) / 2 + sourceOffset));
        const targetX = Math.max(target.left + 18, Math.min(target.right - 18, (target.left + target.right) / 2 + targetOffset));
        const sourceY = source.bottom;
        const targetY = target.top;
        const curveDepth = Math.min(90, (targetY - sourceY) * 0.42);
        const path = `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY + curveDepth}, ${targetX} ${targetY - curveDepth}, ${targetX} ${targetY}`;
        return [{ id: dependency.id, path, active: dependency.active }];
      });
      setConnectors((current) => current.length === nextConnectors.length
        && current.every((connector, index) => connector.id === nextConnectors[index].id
          && connector.path === nextConnectors[index].path
          && connector.active === nextConnectors[index].active)
        ? current
        : nextConnectors);
    };

    const scheduleUpdate = () => {
      if (!active || frameId !== 0) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateConnectors();
      });
    };
    updateConnectors();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate);
    resizeObserver?.observe(canvas);
    resizeObserver?.observe(svg);
    canvas.querySelectorAll<HTMLElement>('[data-skill-anchor]').forEach((anchor) => resizeObserver?.observe(anchor));
    window.addEventListener('resize', scheduleUpdate);
    viewport.addEventListener('scroll', scheduleUpdate, { passive: true });
    document.fonts.addEventListener('loadingdone', scheduleUpdate);
    void document.fonts.ready.then(scheduleUpdate);

    return () => {
      active = false;
      if (frameId !== 0) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      viewport.removeEventListener('scroll', scheduleUpdate);
      document.fonts.removeEventListener('loadingdone', scheduleUpdate);
    };
  }, [skillStates, treeVisible]);


  return (
    <div className="skill-tree-page">
      <div className="skill-tree-page-header">
        <h1 className="skill-tree-page-title">Skill Tree</h1>
        <p className="skill-tree-page-desc">
          Learn concepts, prove mastery through challenges, and unlock skills to rise in rank.
        </p>
      </div>

      {skillProgressionRequest.status === 'preview' && (
        <p className="skill-tree-preview-note" role="status">
          Preview mode — this sample progression is not saved to an account.
        </p>
      )}

      {/* Summary Cards */}
      {(skillProgressionRequest.status === 'preview' || skillProgressionRequest.status === 'success') && (
      <div className="skill-summary stagger-children">
        <div className="skill-summary-card">
          <span className="skill-summary-icon"><AppIcon name="unlock" size={19} /></span>
          <div>
            <div className="skill-summary-value">{totalUnlocked}/{skillStates.length}</div>
            <div className="skill-summary-label">Skills Unlocked</div>
          </div>
        </div>
        <div className="skill-summary-card">
          <span className="skill-summary-icon"><AppIcon name="star" size={19} /></span>
          <div>
            <div className="skill-summary-value">{totalMastered}</div>
            <div className="skill-summary-label">Mastered</div>
          </div>
        </div>
        <div className="skill-summary-card">
          <span className="skill-summary-icon"><AppIcon name="award" size={19} /></span>
          <div>
            <div className="skill-summary-value">{totalPoints}</div>
            <div className="skill-summary-label">Total Skill Points</div>
          </div>
        </div>
      </div>
      )}

      {/* Skill Tree */}
      {treeVisible ? (
        <div
          className="skill-tree-viewport"
          ref={treeViewportRef}
          role="region"
          aria-label="Skill progression tree"
          aria-describedby="skill-tree-scroll-hint"
          tabIndex={0}
        >
          <p id="skill-tree-scroll-hint" className="skill-tree-scroll-hint">
            Follow the branches from prerequisites toward advanced skills. Scroll horizontally to explore the full tree.
          </p>
          <div
            className="skill-tree-container"
            ref={treeContainerRef}
            style={{ width: SKILL_TREE_CANVAS_WIDTH, height: SKILL_TREE_CANVAS_HEIGHT }}
          >
            <svg
              className="skill-tree-svg"
              width={SKILL_TREE_CANVAS_WIDTH}
              height={SKILL_TREE_CANVAS_HEIGHT}
              viewBox={`0 0 ${SKILL_TREE_CANVAS_WIDTH} ${SKILL_TREE_CANVAS_HEIGHT}`}
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <marker id="skill-connector-arrow" viewBox="0 0 6 6" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" refX="5.5" refY="3" orient="auto">
                  <path d="M 0 0 L 6 3 L 0 6 z" fill="var(--text-muted)" />
                </marker>
                <marker id="skill-connector-arrow-active" viewBox="0 0 6 6" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" refX="5.5" refY="3" orient="auto">
                  <path d="M 0 0 L 6 3 L 0 6 z" fill="var(--accent-cyan)" />
                </marker>
              </defs>
              {connectors.map((connector) => (
                <path
                  key={connector.id}
                  className={`skill-connector${connector.active ? ' active' : ''}`}
                  d={connector.path}
                  markerEnd={`url(#skill-connector-arrow${connector.active ? '-active' : ''})`}
                />
              ))}
            </svg>
            <div className="skill-tree-nodes">
              {skillStates.map((skill) => {
                const position = SKILL_TREE_NODE_POSITIONS[skill.id];
                if (!position) return null;
                const state = skill.state;
                return (
                  <button
                    type="button"
                    key={skill.id}
                    data-skill-id={skill.id}
                    data-skill-anchor={skill.id}
                    className={`skill-node ${state}`}
                    style={{ left: position.x, top: position.y }}
                    onClick={() => activateSkill(skill.id)}
                    onMouseEnter={() => setHoveredSkillId(skill.id)}
                    onMouseLeave={() => setHoveredSkillId(null)}
                    aria-label={`View ${skill.name} details. Category: ${skill.category.replace(/-/g, ' ')}. Status: ${state}. Level ${skill.level} of ${skill.maxLevel}.`}
                    aria-controls={displayedSkill?.id === skill.id ? 'skill-detail-panel' : undefined}
                    aria-expanded={displayedSkill?.id === skill.id}
                    aria-pressed={selectedSkillId === skill.id}
                    aria-describedby={state === 'locked' && skill.unlockReason ? `skill-lock-reason-${skill.id}` : undefined}
                  >
                    <span className="skill-node-core">
                      <span className="skill-node-icon" aria-hidden="true">
                        {state === 'locked'
                          ? <AppIcon name="lockKeyhole" size={24} />
                          : state === 'mastered'
                            ? <AppIcon name="star" size={24} />
                            : <AppIcon id={skill.id} glyph={skill.icon} fallback="sparkles" size={24} />}
                      </span>
                    </span>
                    <span className="skill-node-name">{skill.name}</span>
                    <span className="skill-node-category">{skill.category.replace(/-/g, ' ')}</span>
                    <span className="skill-level-pips" aria-hidden="true">
                      {Array.from({ length: skill.maxLevel }, (_, index) => (
                        <span
                          key={index}
                          className={`skill-pip ${index < skill.level ? 'filled' : ''}${skill.level >= skill.maxLevel ? ' max' : ''}`}
                        />
                      ))}
                    </span>
                    <span className="skill-node-level">{skill.level}/{skill.maxLevel}</span>
                    {state === 'locked' && skill.unlockReason && (
                      <span id={`skill-lock-reason-${skill.id}`} className="skill-lock-reason">{skill.unlockReason}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : skillProgressionRequest.status === 'auth-loading' || skillProgressionRequest.status === 'loading' ? (
        <LoadingState label={skillProgressionRequest.status === 'auth-loading' ? 'Checking hunter session' : 'Loading authenticated skill progression'} lines={4} />
      ) : skillProgressionRequest.status === 'empty' ? (
        <EmptyState
          title="No skill progression available"
          description="The server returned no skill progression records for this account."
        />
      ) : (
        <ErrorState
          message={skillProgressionRequest.message}
          onRetry={() => { void refreshSkills(); }}
          retryLabel="Retry"
        />
      )}

      {/* Skill Detail Panel */}
      {displayedSkill && (
        <section id="skill-detail-panel" className="skill-detail-panel" role="region" aria-labelledby="skill-detail-title">
          <button
            type="button"
            className="skill-detail-close"
            onClick={() => { setSelectedSkillId(null); setHoveredSkillId(null); }}
            aria-label="Close skill details"
          >
            <AppIcon name="x" size={16} />
          </button>
          <div className="skill-detail-header">
            <div className="skill-detail-icon" aria-hidden="true"><AppIcon id={displayedSkill.id} glyph={displayedSkill.icon} fallback="sparkles" size={24} /></div>
            <div>
              <h2 id="skill-detail-title" className="skill-detail-name">{displayedSkill.name}</h2>
              <div className="skill-detail-meta">
                <span className={`skill-detail-state skill-detail-state-${displayedSkill.state}`}>
                  {displayedSkill.state.charAt(0).toUpperCase() + displayedSkill.state.slice(1)}
                </span>
                <span className="skill-detail-category">
                  {displayedSkill.category.replace(/-/g, ' ')}
                </span>
              </div>
            </div>
          </div>

          <div className="skill-detail-body">
            <p className="skill-detail-desc">{displayedSkill.description}</p>

            <div className="skill-detail-meta-row">
              <div className="skill-detail-meta-item">
                <span className="skill-detail-meta-label">Level</span>
                <span className="skill-detail-meta-value">
                  {displayedSkill.level} / {displayedSkill.maxLevel}
                </span>
              </div>
              {displayedSkill.conceptId && (
                <div className="skill-detail-meta-item">
                  <span className="skill-detail-meta-label">Concept Mastery</span>
                  <span className="skill-detail-meta-value">
                    {displayedConceptMastery} / 5
                  </span>
                </div>
              )}
            </div>

            {/* Prerequisites */}
            {displayedSkill.prerequisiteIds && displayedSkill.prerequisiteIds.length > 0 && (
              <div className="skill-detail-section">
                <h3 className="skill-detail-section-title">Prerequisite Skills</h3>
                <div className="skill-detail-prereq-list">
                  {displayedSkill.prerequisiteIds.map((pid) => {
                    const prereq = skillStates.find((s) => s.id === pid);
                    const met = prereq ? prereq.level > 0 : false;
                    return (
                      <div
                        key={pid}
                        className={`skill-detail-prereq ${met ? 'met' : 'unmet'}`}
                      >
                        {met ? <AppIcon name="checkCircle" size={14} /> : <AppIcon name="circleX" size={14} />} {prereq?.name || pid}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unlock reason */}
            {displayedSkill.state === 'locked' && displayedSkill.unlockReason && (
              <div className="skill-detail-section skill-detail-locked">
                <h3 className="skill-detail-section-title">Why is this locked?</h3>
                <p>{displayedSkill.unlockReason}</p>
              </div>
            )}

            {/* Mastery path */}
            {displayedSkill.conceptId && (
              <div className="skill-detail-section">
                <h3 className="skill-detail-section-title">Mastery Path</h3>
                <p>
                  Complete challenges related to <strong>{displayedSkill.conceptId}</strong> to level up this
                  skill. Your skill level cannot exceed your concept mastery level for this area.
                </p>
                {(displayedSkill.conceptMasteryLevel ?? 0) > 0 && (
                  <div
                    className="skill-detail-mastery-bar"
                    role="progressbar"
                    aria-label={`${displayedSkill.name} concept mastery`}
                    aria-valuemin={0}
                    aria-valuemax={5}
                    aria-valuenow={displayedConceptMastery}
                  >
                    <div className="skill-detail-mastery-fill" style={{ width: `${(displayedConceptMastery / 5) * 100}%` }} />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="skill-detail-actions">
            <button
              type="button"
              className="skill-detail-btn skill-detail-btn-secondary"
              onClick={() => { setSelectedSkillId(null); setHoveredSkillId(null); }}
            >
              Back
            </button>
            {displayedSkill.state === 'available' && (
              <button
                type="button"
                className="skill-detail-btn skill-detail-btn-primary"
                onClick={() => {
                  void refreshSkills();
                  setSelectedSkillId(null);
                  setHoveredSkillId(null);
                }}
              >
                Start Learning
              </button>
            )}
          </div>
        </section>
      )}

      {(skillProgressionRequest.status === 'preview' || skillProgressionRequest.status === 'success') && <>
      <div
        className="skill-tree-progress-bar"
        role="progressbar"
        aria-label="Skill mastery progress"
        aria-valuemin={0}
        aria-valuemax={skillStates.length}
        aria-valuenow={Math.min(totalMastered, skillStates.length)}
      >
        <div
          className="skill-tree-progress-fill"
          style={{ width: `${masteredPercentage}%` }}
        />
      </div>
      <div className="skill-tree-progress-label">
        {totalMastered}/{skillStates.length} skills mastered
      </div>
      </>}
    </div>
  );
}
