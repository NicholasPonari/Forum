
import { GovernmentLevel } from './geo';

export interface Issue {
    id: number;
    title: string;
    type: string;
    narrative: string;
    image_url?: string | null;
    video_url?: string | null;
    external_video_url?: string | null;
    media_type?: string | null;
    created_at: string;
    user_id?: string;
    username?: string | null;
    user_role?: string | null; // 'Resident' | 'Politician' | 'Candidate'
    location_lat?: number | null;
    location_lng?: number | null;
    address?: string | null;
    federal_district: string | null;
    municipal_district: string | null;
    provincial_district: string | null;
    avatar_url?: string | null;
    topic?: string | null;
    government_level?: GovernmentLevel | null;
    province?: string | null;
    city?: string | null;
    author_province?: string | null;
    author_city?: string | null;
}

export interface DetailedIssue {
    id: number;
    title: string;
    type: string;
    narrative: string;
    image_url?: string | null;
    video_url?: string | null;
    external_video_url?: string | null;
    media_type?: string | null;
    created_at: string;
    user_id?: string;
    username?: string | null;
    location_lat: number;
    location_lng: number;
    address: string;
    topic?: string | null;
    province?: string | null;
    city?: string | null;
    profiles: {
        id: string;
        username: string | null;
        avatar_url?: string | null;
    }[];
    votes: {
        issue_id: number;
        value: 1 | -1;
    }[];
}

export interface Vote {
    value: number;
    issue_id: string;
}

export type VoteMap = Record<number, number>;

export type VoteBreakdown = {
    [issueId: number]: {
        upvotes: number;
        downvotes: number;
    };
};

export type CommentsCountMap = Record<number, number>;

export interface Profile {
    id?: string;
    username?: string;
    avatar_url?: string;
    first_name?: string;
    last_name?: string;
    bio?: string;
    interests?: string[];
    issues_cared_about?: string[];
    bookmarks?: string[];
    location?: string;
    website?: string;
    role?: string; // 'Resident' | 'Politician' | 'Candidate'
    type?: string;
    verified?: boolean;
    language?: 'en' | 'fr';
    created_at?: string;
    updated_at?: string;
    user_id?: string;
    // Relations (often joined)
    federal_district?: { name_en: string } | null;
    provincial_district?: { name: string; province: string } | null;
    municipal_district?: { name: string; borough: string | null; city: string } | null;
    coord?: { lat: number; lng: number } | string | null; // Can be JSON string or object
}

export interface UserProfile {
	id: string;
	username: string | null;
	type: string | null;
	verified: boolean;
	avatar_url?: string | null;
	coord?: { lat: number; lng: number } | null;
	bookmarks?: string[] | null;
	federal_district_id?: number | null;
	municipal_district_id?: number | null;
	provincial_district_id?: number | null;
	federal_district?: {
		name_en: string;
		name_fr: string | null;
	} | null;
	municipal_district?: {
		name: string;
		city: string;
		borough: string | null;
	} | null;
	provincial_district?: {
		name: string;
		province: string;
	} | null;
	first_name?: string | null;
	last_name?: string | null;
	bio?: string | null;
	website?: string | null;
	language?: 'en' | 'fr' | null;
}

export interface ProfileWithHistory extends Profile {
	comments: Comment[];
	issues: DetailedIssue[];
}

export interface Comment {
	id: string;
	issue_id: string;
	user_id: string;
	content: string;
	created_at: string;
	updated_at?: string;
}

// ============================================================
// Parliamentary Debate Types
// ============================================================

export type DebateStatus =
  | 'scheduled'
  | 'detected'
  | 'scraping_hansard'
  | 'ingesting'
  | 'transcribing'
  | 'processing'
  | 'summarizing'
  | 'categorizing'
  | 'publishing'
  | 'published'
  | 'error';

export type DebateSessionType =
  | 'house'
  | 'committee'
  | 'question_period'
  | 'emergency'
  | 'other';

export interface Legislature {
  id: string;
  name: string;
  name_fr?: string;
  code: string;
  level: 'federal' | 'provincial';
  website_url?: string;
  video_base_url?: string;
  hansard_base_url?: string;
  calendar_url?: string;
  created_at: string;
}

export interface Debate {
  id: string;
  legislature_id: string;
  external_id?: string;
  title: string;
  title_fr?: string;
  date: string;
  session_type: DebateSessionType;
  committee_name?: string;
  status: DebateStatus;
  error_message?: string;
  retry_count: number;
  duration_seconds?: number;
  source_urls: { type: string; url: string; label: string }[];
  hansard_url?: string;
  video_url?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined fields
  legislatures?: Legislature;
}

export interface DebateMediaAsset {
  id: string;
  debate_id: string;
  media_type: 'video' | 'audio';
  source: string;
  original_url: string;
  local_path?: string;
  file_size_bytes?: number;
  duration_seconds?: number;
  language?: string;
  status: 'pending' | 'downloading' | 'ready' | 'error';
  created_at: string;
}

export interface DebateTranscript {
  id: string;
  debate_id: string;
  language: string;
  raw_text?: string;
  segments?: { start: number; end: number; text: string; speaker_label?: string }[];
  whisper_model?: string;
  avg_confidence?: number;
  word_count?: number;
  processing_time_seconds?: number;
  created_at: string;
}

export interface DebateSpeaker {
  id: string;
  legislature_id?: string;
  name: string;
  name_normalized?: string;
  party?: string;
  riding?: string;
  role?: string;
  external_person_id?: string;
  profile_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DebateContribution {
  id: string;
  debate_id: string;
  speaker_id?: string;
  speaker_name_raw?: string;
  start_time_seconds?: number;
  end_time_seconds?: number;
  duration_seconds?: number;
  text: string;
  text_fr?: string;
  key_points: { point: string; stance?: string }[];
  language?: string;
  sequence_order?: number;
  created_at: string;
  // Joined fields
  debate_speakers?: DebateSpeaker;
}

export interface DebateVote {
  id: string;
  debate_id: string;
  motion_text?: string;
  motion_text_fr?: string;
  bill_number?: string;
  yea: number;
  nay: number;
  abstain: number;
  paired: number;
  result?: 'passed' | 'defeated' | 'tied';
  source_vote_id?: string;
  vote_details: { speaker_id: string; vote: string }[];
  created_at: string;
}

export interface DebateSummary {
  id: string;
  debate_id: string;
  language: string;
  summary_text: string;
  key_participants: { name: string; party?: string; riding?: string; stance_summary: string }[];
  key_issues: { issue: string; description: string }[];
  outcome_text?: string;
  llm_model?: string;
  created_at: string;
}

export interface DebateCategory {
  id: string;
  debate_id: string;
  topic_slug: string;
  confidence: number;
  is_primary: boolean;
  created_at: string;
}

export interface DebateForumPost {
  id: string;
  debate_id: string;
  issue_id?: string;
  status: 'pending' | 'created' | 'updated' | 'error';
  error_message?: string;
  post_html?: string;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface Politician {
  id: string;
  idx?: number;
  name: string;
  district: string;
  organization: string;
  primary_role_en: string;
  primary_role_fr?: string;
  party: string | null;
  email: string | null;
  photo_url: string | null;
  source_url?: string | null;
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  twitter?: string | null;
  linkedin?: string | null;
  youtube?: string | null;
  address?: string | null;
  phone?: string | null;
  salary?: number | null;
}
