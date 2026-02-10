-- Migration: Hansard-first pipeline support
-- Adds debate_topics table, scraping_hansard status, and schema updates
-- for the new pipeline that uses official Hansard transcripts directly
-- instead of downloading video + running Whisper.

-- ============================================================
-- 1. Add 'scraping_hansard' to debate status enum
-- ============================================================
ALTER TABLE debates DROP CONSTRAINT IF EXISTS debates_status_check;
ALTER TABLE debates ADD CONSTRAINT debates_status_check CHECK (status IN (
  'scheduled',
  'detected',
  'scraping_hansard',
  'ingesting',
  'transcribing',
  'processing',
  'summarizing',
  'categorizing',
  'publishing',
  'published',
  'error'
));

-- ============================================================
-- 2. Create debate_topics table
--    Stores topic/bill sections extracted from Hansard scrape.
--    Each debate can have multiple topics (e.g., Bill C-230, Question Period).
-- ============================================================
CREATE TABLE IF NOT EXISTS debate_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id UUID NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  topic_title TEXT NOT NULL,
  topic_external_id TEXT,
  section TEXT,                    -- 'Government Orders', 'Oral Question Period', etc.
  speech_count INT DEFAULT 0,
  speaker_count INT DEFAULT 0,
  parties_involved TEXT[] DEFAULT '{}',
  sequence_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(debate_id, topic_title)
);

CREATE INDEX IF NOT EXISTS idx_debate_topics_debate ON debate_topics(debate_id);
CREATE INDEX IF NOT EXISTS idx_debate_topics_section ON debate_topics(section);

ALTER TABLE debate_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read debate topics" ON debate_topics FOR SELECT USING (true);

-- ============================================================
-- 3. Add speaker_name + metadata columns to debate_contributions
--    The Hansard-first pipeline stores speaker_name directly
--    (not just speaker_id FK) and rich metadata from the scrape.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'debate_contributions' AND column_name = 'speaker_name'
  ) THEN
    ALTER TABLE debate_contributions ADD COLUMN speaker_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'debate_contributions' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE debate_contributions ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ============================================================
-- 4. Add external_id to debate_speakers for member page linking
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'debate_speakers' AND column_name = 'external_id'
  ) THEN
    ALTER TABLE debate_speakers ADD COLUMN external_id TEXT;
  END IF;
END $$;

-- ============================================================
-- 5. Add debate_id-scoped unique constraint on debate_speakers
--    The Hansard-first pipeline upserts speakers per-debate.
--    The existing unique is (legislature_id, name_normalized) which
--    doesn't work for per-debate speaker records.
-- ============================================================
DO $$
BEGIN
  -- Add debate_id column first (must exist before creating index on it)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'debate_speakers' AND column_name = 'debate_id'
  ) THEN
    ALTER TABLE debate_speakers ADD COLUMN debate_id UUID REFERENCES debates(id) ON DELETE CASCADE;
    CREATE INDEX idx_debate_speakers_debate ON debate_speakers(debate_id);
  END IF;

  -- Now create the per-debate unique index
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_debate_speakers_debate_name'
  ) THEN
    CREATE UNIQUE INDEX idx_debate_speakers_debate_name
      ON debate_speakers(debate_id, name)
      WHERE debate_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 6. Update legislatures seed: new calendar URL for federal
-- ============================================================
UPDATE legislatures
SET calendar_url = 'https://www.ourcommons.ca/en/parliamentary-business'
WHERE code = 'CA';
