-- Backfill goals.color for existing NULL rows so every goal gets a
-- persistent palette color right away, cycling per user by creation order.
WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) - 1) % 8 AS idx
  FROM goals
  WHERE color IS NULL
),
palette(idx, hex) AS (
  VALUES
    (0, '#16a34a'),  -- green
    (1, '#d9642e'),  -- coral
    (2, '#0284c7'),  -- sky
    (3, '#7c3aed'),  -- violet
    (4, '#db2777'),  -- pink
    (5, '#0d9488'),  -- teal
    (6, '#a16207'),  -- amber
    (7, '#475569')   -- slate
)
UPDATE goals g
SET color = p.hex
FROM ranked r
JOIN palette p ON p.idx = r.idx
WHERE g.id = r.id;
