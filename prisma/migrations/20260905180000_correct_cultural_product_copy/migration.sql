-- Correct only known erroneous seed copy; preserve bespoke admin descriptions.
UPDATE "Product"
SET "description" = 'Mekwamiya — a liturgical prayer and chanting staff used in Ethiopian Orthodox worship.'
WHERE "category" = 'MEKWAMIYA' AND "description" = 'Mekwamiya - spiritual Ethiopian wind instrument.';

UPDATE "Product"
SET "description" = 'Kaba — traditional Ethiopian ceremonial clothing worn for special and religious occasions.'
WHERE "category" = 'KABA' AND "description" = 'Kaba - traditional Ethiopian drum instrument.';

UPDATE "Product"
SET "description" = 'Tsenatsl — a shaken metal sistrum (idiophone) used in Ethiopian Orthodox church worship.'
WHERE "category" = 'TSENATSL' AND "description" = 'Tsenatsl - traditional Ethiopian percussion instrument.';

UPDATE "Product" SET "name" = 'Pickups' WHERE "category" = 'PICK_UPS' AND "name" = 'Pick Ups';
