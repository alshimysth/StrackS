-- Test data for the backup / restore run (#45). Schema reduced to the tables backup.sh
-- requires in the dump, with a volume representative of real usage.
CREATE TABLE flyway_schema_history (installed_rank int PRIMARY KEY, version varchar(50), success boolean NOT NULL);
INSERT INTO flyway_schema_history VALUES (1,'1',true),(2,'2',true),(3,'3',true),(4,'4',true),(5,'5',true),(6,'6',true),(7,'7',true);
CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL);
INSERT INTO users (email) SELECT 'essai-' || g || '@example.com' FROM generate_series(1, 50) g;
CREATE TABLE activities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id) ON DELETE CASCADE, started_at timestamptz NOT NULL);
INSERT INTO activities (user_id, started_at) SELECT u.id, now() - (g || ' days')::interval FROM users u, generate_series(1, 40) g;
CREATE TABLE track_points (activity_id uuid REFERENCES activities(id) ON DELETE CASCADE, seq int, lat double precision, lng double precision, PRIMARY KEY (activity_id, seq));
INSERT INTO track_points SELECT a.id, g, 45 + g * 0.0001, 5.0 FROM activities a, generate_series(1, 300) g;
