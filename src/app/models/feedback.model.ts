export type LikertValue = 1 | 2 | 3 | 4 | 5 | null;

export type FamiliarityLevel =
  | 'not_familiar'
  | 'somewhat'
  | 'familiar'
  | 'very_familiar'
  | 'expert';

export interface FeedbackPayload {

  outputsUnderstandable: LikertValue;
  statementsCorrect: LikertValue;
  logicSound: LikertValue;
  sourcesIdentifiable: LikertValue;
  incorrectClaims: string;
  goodReasoningExample: string;
  poorReasoningExample: string;
  additionalInfoDesired: string;
  additionalTestingData: string;

  toolFamiliarity: FamiliarityLevel | null;
  toolStraightforward: LikertValue;
  experienceStandout: string;
  wouldUseAgain: LikertValue;

  email: string;
  name: string;
  affiliation: string;
  toolComparison: string;
  additionalFeatures: string;

  id: string;
  startTime: string;
  completionTime: string;
}

export interface FeedbackItem {
  id: string;
  organizationId: number;
  userId: string;
  outputsUnderstandable: number | null;
  statementsCorrect: number | null;
  logicSound: number | null;
  sourcesIdentifiable: number | null;
  incorrectClaims: string | null;
  goodReasoningExample: string | null;
  poorReasoningExample: string | null;
  additionalInfoDesired: string | null;
  additionalTestingData: string | null;
  toolFamiliarity: string | null;
  toolStraightforward: number | null;
  experienceStandout: string | null;
  wouldUseAgain: number | null;
  email: string | null;
  name: string | null;
  affiliation: string | null;
  toolComparison: string | null;
  additionalFeatures: string | null;
  startTime: string;
  completionTime: string;
  createdAt: string;
}

export interface PagedFeedback {
  items: FeedbackItem[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
}
