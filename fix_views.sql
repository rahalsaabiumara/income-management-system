DROP VIEW IF EXISTS bi_laba_rugi CASCADE;
DROP VIEW IF EXISTS bi_arus_kas CASCADE;
DROP VIEW IF EXISTS bi_neraca CASCADE;
DROP VIEW IF EXISTS bi_pendapatan CASCADE;

CREATE VIEW bi_laba_rugi AS SELECT * FROM laba_rugi;
CREATE VIEW bi_arus_kas AS SELECT * FROM arus_kas;
CREATE VIEW bi_neraca AS SELECT * FROM neraca;
CREATE VIEW bi_pendapatan AS SELECT * FROM pendapatan;
