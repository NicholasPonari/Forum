-- Migration: Add 'scheduled' to the allowed values for debate status
-- This is required to track upcoming debates from the calendar before they have video/hansard

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'debates') THEN
        -- Drop the old constraint if it exists
        ALTER TABLE debates DROP CONSTRAINT IF EXISTS debates_status_check;
        
        -- Add the new constraint with 'scheduled' included
        ALTER TABLE debates ADD CONSTRAINT debates_status_check CHECK (status IN (
          'scheduled', 
          'detected', 
          'ingesting', 
          'transcribing', 
          'processing', 
          'summarizing', 
          'categorizing', 
          'publishing', 
          'published', 
          'error'
        ));
    END IF;
END $$;
