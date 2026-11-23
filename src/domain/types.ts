export type Source = [string, string];
export type Grade = "again" | "good" | "easy";
export interface AnswerDetail {
  principle?: string;
  example?: string;
  code?: string;
  pitfalls?: string;
  followups?: [string, string][];
  sources?: Source[];
}
export interface StudyQuestion {
  version?: number;
  origin?: string;
  id: string;
  kind: "choice" | "boolean" | "oral";
  prompt: string;
  choices?: string[];
  correctAnswer?: number | boolean;
  explanation: string;
  detail?: AnswerDetail;
  topicId?: string;
  chainId?: string;
  stepIndex?: number;
  source?: Source;
  label?: string;
}
export interface Topic {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  questionIds: string[];
  category: string;
  color: string;
  symbol: string;
  sections: TopicSection[];
}
export interface TopicSection {
  id: string;
  title: string;
  kind: "foundation" | "chain" | "application";
  questionIds: string[];
}
export interface Chain {
  id: string;
  title: string;
  groupId: string;
  questionIds: string[];
  check: string;
  source?: Source;
}
export interface Group {
  id: string;
  title: string;
  chainIds: string[];
}
export interface CoverageItem {
  id: string;
  title: string;
  [key: string]: unknown;
}
export interface Bank {
  schemaVersion: 1;
  version: string;
  topics: Topic[];
  groups: Group[];
  chains: Chain[];
  questions: StudyQuestion[];
  coverage: CoverageItem[];
}
export interface LearningRecord {
  status: "new" | "learning" | "mastered";
  attempts: number;
  correct: number;
  note: string;
  draft: string;
  bookmarked: boolean;
  lastReviewedAt?: string;
  nextReviewAt?: string;
}
export interface SessionAnswer {
  text: string;
  pick?: number | boolean;
  grade?: Grade;
  revealed: boolean;
}
export interface StudySession {
  questionSnapshots?: Record<string, StudyQuestion>;
  id: string;
  title: string;
  mode: "quiz" | "oral" | "mock";
  questionIds: string[];
  index: number;
  answers: Record<string, SessionAnswer>;
  startedAt: string;
  completedAt?: string;
  optionOrders?: Record<string, number[]>;
}
export interface ProgressSnapshot {
  version: 3;
  records: Record<string, LearningRecord>;
  session: StudySession | null;
  history: StudySession[];
  evidence: Record<string, string>;
  code: Record<string, string>;
  dailyGoal: number;
  activity: Record<string, number>;
  xp: number;
}
