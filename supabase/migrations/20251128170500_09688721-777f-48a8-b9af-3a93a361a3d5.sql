-- Add sets column to store array of sets with individual reps and weight
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sets JSONB DEFAULT '[]'::JSONB;

-- Create a function to migrate existing data
CREATE OR REPLACE FUNCTION migrate_session_data()
RETURNS void AS $$
DECLARE
  session_record RECORD;
  sets_array JSONB;
BEGIN
  FOR session_record IN SELECT id, series, reps, weight FROM sessions LOOP
    -- Build sets array by replicating the same reps/weight for each series
    sets_array := '[]'::JSONB;
    FOR i IN 1..session_record.series LOOP
      sets_array := sets_array || jsonb_build_array(
        jsonb_build_object('reps', session_record.reps, 'weight', session_record.weight)
      );
    END LOOP;
    
    -- Update the session with the new sets array
    UPDATE sessions 
    SET sets = sets_array 
    WHERE id = session_record.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run the migration
SELECT migrate_session_data();

-- Drop the migration function
DROP FUNCTION migrate_session_data();