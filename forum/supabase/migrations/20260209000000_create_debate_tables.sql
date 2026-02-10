-- Parliamentary Debate Tracking System - Core Tables
-- Migration: Create all debate-related tables for the parliament pipeline

-- ============================================================
-- Legislatures reference table
-- ============================================================
CREATE TABLE legislatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_fr TEXT,
  code TEXT NOT NULL UNIQUE,  -- 'CA', 'ON', 'QC'
  level TEXT NOT NULL CHECK (level IN ('federal', 'provincial')),
  website_url TEXT,
  video_base_url TEXT,
  hansard_base_url TEXT,
  calendar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Core debates table
-- ============================================================
CREATE TABLE debates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legislature_id UUID NOT NULL REFERENCES legislatures(id),
  external_id TEXT,
  title TEXT NOT NULL,
  title_fr TEXT,
  date DATE NOT NULL,
  session_type TEXT NOT NULL CHECK (session_type IN
    ('house', 'committee', 'question_period', 'emergency', 'other')),
  committee_name TEXT,
  status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN
    ('scheduled', 'detected', 'ingesting', 'transcribing', 'processing',
     'summarizing', 'categorizing', 'publishing', 'published', 'error')),
  error_message TEXT,
  retry_count INT DEFAULT 0,
  duration_seconds INT,
  source_urls JSONB DEFAULT '[]'::jsonb,
  hansard_url TEXT,
  video_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(legislature_id, external_id)
);

-- ============================================================
-- Media assets linked to debates
-- ============================================================
CREATE TABLE debate_media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('video', 'audio')),
  source TEXT NOT NULL,
  original_url TEXT NOT NULL,
  local_path TEXT,
  file_size_bytes BIGINT,
  duration_seconds INT,
  language TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN
    ('pending', 'downloading', 'ready', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Transcripts
-- ============================================================
CREATE TABLE debate_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  raw_text TEXT,
  segments JSONB,
  whisper_model TEXT,
  avg_confidence REAL,
  word_count INT,
  processing_time_seconds INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Speakers (politicians / participants)
-- ============================================================
CREATE TABLE debate_speakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legislature_id UUID REFERENCES legislatures(id),
  name TEXT NOT NULL,
  name_normalized TEXT,
  party TEXT,
  riding TEXT,
  role TEXT,
  external_person_id TEXT,
  profile_id UUID REFERENCES profiles(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(legislature_id, name_normalized)
);

-- ============================================================
-- Individual speaker contributions within a debate
-- ============================================================
CREATE TABLE debate_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  speaker_id UUID REFERENCES debate_speakers(id),
  speaker_name_raw TEXT,
  start_time_seconds REAL,
  end_time_seconds REAL,
  duration_seconds REAL GENERATED ALWAYS AS (end_time_seconds - start_time_seconds) STORED,
  text TEXT NOT NULL,
  text_fr TEXT,
  key_points JSONB DEFAULT '[]'::jsonb,
  language TEXT,
  sequence_order INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Parliamentary votes
-- ============================================================
CREATE TABLE debate_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  motion_text TEXT,
  motion_text_fr TEXT,
  bill_number TEXT,
  yea INT,
  nay INT,
  abstain INT DEFAULT 0,
  paired INT DEFAULT 0,
  result TEXT CHECK (result IN ('passed', 'defeated', 'tied')),
  source_vote_id TEXT,
  vote_details JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Summaries (EN + FR)
-- ============================================================
CREATE TABLE debate_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  key_participants JSONB DEFAULT '[]'::jsonb,
  key_issues JSONB DEFAULT '[]'::jsonb,
  outcome_text TEXT,
  llm_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(debate_id, language)
);

-- ============================================================
-- Category mapping
-- ============================================================
CREATE TABLE debate_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  topic_slug TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Forum post tracking
-- ============================================================
CREATE TABLE debate_forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES issues(id),
  status TEXT DEFAULT 'pending' CHECK (status IN
    ('pending', 'created', 'updated', 'error')),
  error_message TEXT,
  post_html TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_debates_legislature ON debates(legislature_id);
CREATE INDEX idx_debates_status ON debates(status);
CREATE INDEX idx_debates_date ON debates(date DESC);
CREATE INDEX idx_debates_created_at ON debates(created_at DESC);
CREATE INDEX idx_contributions_debate ON debate_contributions(debate_id);
CREATE INDEX idx_contributions_speaker ON debate_contributions(speaker_id);
CREATE INDEX idx_transcripts_debate ON debate_transcripts(debate_id);
CREATE INDEX idx_summaries_debate ON debate_summaries(debate_id);
CREATE INDEX idx_forum_posts_debate ON debate_forum_posts(debate_id);
CREATE INDEX idx_media_assets_debate ON debate_media_assets(debate_id);
CREATE INDEX idx_categories_debate ON debate_categories(debate_id);
CREATE INDEX idx_speakers_legislature ON debate_speakers(legislature_id);
CREATE INDEX idx_speakers_normalized ON debate_speakers(name_normalized);
CREATE INDEX idx_votes_debate ON debate_votes(debate_id);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE legislatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE debate_forum_posts ENABLE ROW LEVEL SECURITY;

-- Public read access for all debate data
CREATE POLICY "Public read legislatures" ON legislatures FOR SELECT USING (true);
CREATE POLICY "Public read debates" ON debates FOR SELECT USING (true);
CREATE POLICY "Public read media assets" ON debate_media_assets FOR SELECT USING (true);
CREATE POLICY "Public read transcripts" ON debate_transcripts FOR SELECT USING (true);
CREATE POLICY "Public read speakers" ON debate_speakers FOR SELECT USING (true);
CREATE POLICY "Public read contributions" ON debate_contributions FOR SELECT USING (true);
CREATE POLICY "Public read debate votes" ON debate_votes FOR SELECT USING (true);
CREATE POLICY "Public read summaries" ON debate_summaries FOR SELECT USING (true);
CREATE POLICY "Public read categories" ON debate_categories FOR SELECT USING (true);
CREATE POLICY "Public read forum posts" ON debate_forum_posts FOR SELECT USING (true);

-- Service role key bypasses RLS, so no explicit write policies needed for the pipeline.
-- If anon/authenticated users ever need write access, add policies here.

-- ============================================================
-- Seed data: Legislatures
-- ============================================================
INSERT INTO legislatures (name, name_fr, code, level, website_url, video_base_url, hansard_base_url, calendar_url) VALUES
  (
    'House of Commons',
    'Chambre des communes',
    'CA',
    'federal',
    'https://www.ourcommons.ca',
    'https://parlvu.parl.gc.ca',
    'https://www.ourcommons.ca/documentviewer/en/house/latest/hansard',
    'https://www.ourcommons.ca/en/sitting-calendar'
  ),
  (
    'Ontario Legislature',
    'Assemblée législative de l''Ontario',
    'ON',
    'provincial',
    'https://www.ola.org',
    'https://www.ola.org/en/legislative-business',
    'https://www.ola.org/en/legislative-business/house-documents',
    'https://www.ola.org/en/legislative-business/house-calendar'
  ),
  (
    'National Assembly of Quebec',
    'Assemblée nationale du Québec',
    'QC',
    'provincial',
    'https://www.assnat.qc.ca',
    'https://www.assnat.qc.ca/en/video-audio',
    'https://www.assnat.qc.ca/en/travaux-parlementaires/journaux-debats.html',
    'https://www.assnat.qc.ca/en/travaux-parlementaires/calendrier-parlementaire.html'
  );

-- ============================================================
-- Updated_at trigger for debates table
-- ============================================================
CREATE OR REPLACE FUNCTION update_debates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_debates_updated_at
  BEFORE UPDATE ON debates
  FOR EACH ROW
  EXECUTE FUNCTION update_debates_updated_at();

CREATE OR REPLACE FUNCTION update_debate_forum_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_debate_forum_posts_updated_at
  BEFORE UPDATE ON debate_forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_debate_forum_posts_updated_at();
