-- Normalize legacy generic names without changing named/custom builds or URLs.
UPDATE "Product" SET "name" = 'Begena'
WHERE "category" = 'BEGENA' AND lower("name") = 'begena';

UPDATE "Product" SET "name" = 'Masenqo'
WHERE "category" = 'MESENKO' AND lower("name") IN ('mesenqo', 'mesenko', 'masenqo');

UPDATE "Product"
SET "description" = 'Pickups - essential accessory for string instruments.'
WHERE "category" = 'PICK_UPS' AND "description" = 'Pick Ups - essential accessory for string instruments.';
