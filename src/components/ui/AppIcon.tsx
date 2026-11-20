import {
  Activity, AlertTriangle, ArrowDown, ArrowDownUp, ArrowLeft, ArrowRight, ArrowUp, Award,
  BarChart3, Binary, Bird, BookOpen, Brain, Braces, Bug, Building2, CalendarDays,
  Check, CheckCircle2, CircleDot, CircleHelp, CircleX, Clock3, Code2, Copy,
  Crosshair, Crown, Database, DoorOpen, Droplets, Dumbbell, Eye, FileText, Flag, Flame,
  FlaskConical, Gem, GitBranch, Gift, Heart, Hourglass, Inbox, KeyRound, Laptop, Layers,
  Lightbulb, Link2, List, ListChecks, Lock, LockKeyhole, LogIn, LogOut, Medal,
  Menu, Monitor, Moon, Network, Package, PawPrint, Play, RefreshCw, RotateCcw,
  ScrollText, Search, Settings, Share2, Shield, ShieldCheck, Shuffle, Skull,
  Snowflake, Sparkles, Star, Sword, Swords, Target, Timer, TrendingUp, Trophy,
  UnlockKeyhole, UserRound, Users, Workflow, X, XCircle, Zap,
  type LucideIcon,
} from 'lucide-react';

const ICONS = {
  activity: Activity,
  alertTriangle: AlertTriangle,
  arrowDown: ArrowDown,
  arrowDownUp: ArrowDownUp,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUp: ArrowUp,
  award: Award,
  barChart: BarChart3,
  binary: Binary,
  bird: Bird,
  book: BookOpen,
  brain: Brain,
  braces: Braces,
  bug: Bug,
  building: Building2,
  calendar: CalendarDays,
  check: Check,
  checkCircle: CheckCircle2,
  circle: CircleDot,
  circleHelp: CircleHelp,
  circleX: CircleX,
  clock: Clock3,
  code: Code2,
  copy: Copy,
  crosshair: Crosshair,
  crown: Crown,
  database: Database,
  door: DoorOpen,
  droplets: Droplets,
  dumbbell: Dumbbell,
  eye: Eye,
  file: FileText,
  flag: Flag,
  flame: Flame,
  flask: FlaskConical,
  gem: Gem,
  gitBranch: GitBranch,
  gift: Gift,
  heart: Heart,
  hourglass: Hourglass,
  inbox: Inbox,
  key: KeyRound,
  laptop: Laptop,
  layers: Layers,
  lightbulb: Lightbulb,
  link: Link2,
  list: List,
  listChecks: ListChecks,
  lock: Lock,
  lockKeyhole: LockKeyhole,
  logIn: LogIn,
  logOut: LogOut,
  medal: Medal,
  menu: Menu,
  monitor: Monitor,
  moon: Moon,
  network: Network,
  package: Package,
  paw: PawPrint,
  play: Play,
  refresh: RefreshCw,
  reset: RotateCcw,
  scroll: ScrollText,
  search: Search,
  settings: Settings,
  share: Share2,
  shield: Shield,
  shieldCheck: ShieldCheck,
  shuffle: Shuffle,
  skull: Skull,
  snowflake: Snowflake,
  sparkles: Sparkles,
  star: Star,
  sword: Sword,
  swords: Swords,
  target: Target,
  timer: Timer,
  trendingUp: TrendingUp,
  trophy: Trophy,
  unlock: UnlockKeyhole,
  user: UserRound,
  users: Users,
  workflow: Workflow,
  x: X,
  xCircle: XCircle,
  zap: Zap,
} satisfies Record<string, LucideIcon>;

export type AppIconName = keyof typeof ICONS;

const GLYPH_ICON_NAMES: Record<number, AppIconName> = {
  0x2197: 'trendingUp', 0x23f1: 'timer', 0x23f3: 'hourglass', 0x25b6: 'play',
  0x2694: 'swords', 0x2699: 'settings', 0x26a0: 'alertTriangle', 0x26a1: 'zap',
  0x2705: 'checkCircle', 0x2728: 'sparkles', 0x2744: 'snowflake', 0x2b06: 'arrowUp',
  0x2b07: 'arrowDown', 0x2b50: 'star', 0x1f311: 'moon', 0x1f31f: 'star',
  0x1f333: 'network', 0x1f389: 'sparkles', 0x1f396: 'medal', 0x1f3af: 'target',
  0x1f3c6: 'trophy', 0x1f3d7: 'database', 0x1f3f0: 'building', 0x1f3f3: 'flag',
  0x1f409: 'shield', 0x1f40d: 'code', 0x1f41b: 'bug', 0x1f43a: 'paw',
  0x1f441: 'eye', 0x1f451: 'crown', 0x1f464: 'user', 0x1f465: 'users',
  0x1f480: 'skull', 0x1f48e: 'gem', 0x1f4a0: 'gem', 0x1f4a1: 'lightbulb',
  0x1f4bb: 'laptop', 0x1f4c8: 'trendingUp', 0x1f4ca: 'barChart', 0x1f4cb: 'listChecks',
  0x1f4d6: 'book', 0x1f4da: 'book', 0x1f4dc: 'scroll', 0x1f4dd: 'scroll',
  0x1f4e6: 'package', 0x1f4ed: 'inbox', 0x1f500: 'gitBranch', 0x1f50d: 'search',
  0x1f512: 'lockKeyhole', 0x1f513: 'unlock', 0x1f517: 'link', 0x1f525: 'flame',
  0x1f52e: 'sparkles', 0x1f534: 'circle', 0x1f578: 'share', 0x1f5a5: 'monitor',
  0x1f5dd: 'key', 0x1f5e1: 'sword', 0x1f947: 'medal', 0x1f948: 'medal',
  0x1f949: 'medal', 0x1f985: 'bird', 0x1f9e0: 'brain', 0x1f9ea: 'flask',
  0x1f9ee: 'binary', 0x1fa78: 'droplets', 0x1f680: 'trendingUp', 0x1f6e1: 'shield',
  0x1f7e1: 'circle', 0x1f7e2: 'circle', 0x2713: 'check', 0x2717: 'x',
  0x2715: 'x', 0x27f3: 'refresh',
};

export const SKILL_ICON_NAMES: Record<string, AppIconName> = {
  'skill-variables': 'package',
  'skill-control-flow': 'gitBranch',
  'skill-functions': 'code',
  'skill-arrays': 'list',
  'skill-objects': 'database',
  'skill-linked-lists': 'link',
  'skill-stacks-queues': 'layers',
  'skill-searching': 'search',
  'skill-sorting': 'arrowDownUp',
  'skill-trees': 'network',
  'skill-graphs': 'share',
  'skill-dp': 'workflow',
  'skill-dom': 'monitor',
  'skill-async': 'clock',
};

export const ACHIEVEMENT_ICON_NAMES: Record<string, AppIconName> = {
  'ach-001': 'crosshair', 'ach-002': 'flame', 'ach-003': 'arrowUp', 'ach-004': 'bug',
  'ach-005': 'zap', 'ach-006': 'crown', 'ach-007': 'database', 'ach-008': 'binary',
  ach_first_spell: 'sparkles', ach_code_weaver: 'scroll', ach_tenacious_coder: 'zap',
  ach_concept_master: 'brain', ach_omni_caster: 'network', ach_level_5: 'sparkles',
  ach_level_10: 'shield', ach_rank_d: 'sword', ach_rank_c: 'swords',
  ach_gate_explorer: 'door', ach_first_boss: 'skull', ach_awakening_gate: 'building',
  ach_dungeon_master: 'crown', ach_streak_3: 'flame', ach_streak_7: 'flame',
  ach_daily_bounty: 'gift', ach_first_skill: 'award', ach_skill_collector: 'key',
  ach_promotion_trial: 'trophy', ach_grandmaster: 'crown', ach_tourn_contender: 'swords',
  ach_tourn_champion: 'trophy',
};

export function getIconNameFromGlyph(glyph?: string | null): AppIconName | undefined {
  const codePoint = Array.from(glyph ?? '')[0]?.codePointAt(0);
  return codePoint === undefined ? undefined : GLYPH_ICON_NAMES[codePoint];
}

interface AppIconProps {
  name?: AppIconName;
  id?: string;
  glyph?: string | null;
  fallback?: AppIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  color?: string;
  label?: string;
}

export function AppIcon({
  name,
  id,
  glyph,
  fallback = 'sparkles',
  size = 18,
  strokeWidth = 1.8,
  className,
  color,
  label,
}: AppIconProps) {
  const resolved = name ?? (id ? ACHIEVEMENT_ICON_NAMES[id] ?? SKILL_ICON_NAMES[id] : undefined) ?? getIconNameFromGlyph(glyph) ?? fallback;
  const Icon = ICONS[resolved];
  return <Icon size={size} strokeWidth={strokeWidth} className={className} color={color} aria-hidden={label ? undefined : true} aria-label={label} />;
}
