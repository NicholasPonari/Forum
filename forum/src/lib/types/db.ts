
import { GovernmentLevel } from './geo';

export interface Issue {
    id: number;
    title: string;
    type: string;
    narrative: string;
    image_url?: string | null;
    video_url?: string | null;
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
}
