DROP VIEW IF EXISTS bi_laba_rugi CASCADE;
DROP VIEW IF EXISTS bi_arus_kas CASCADE;
DROP VIEW IF EXISTS bi_neraca CASCADE;
DROP VIEW IF EXISTS bi_pendapatan CASCADE;

CREATE VIEW bi_laba_rugi AS 
SELECT id, bulan, uraian, sub_uraian, jenis, value FROM laba_rugi 
WHERE NOT (jenis = 'RKAP' AND EXTRACT(YEAR FROM bulan) = 2026)
UNION ALL 
SELECT id, TO_DATE(tahun::text || '-12-31', 'YYYY-MM-DD') AS bulan, uraian, sub_uraian, jenis, value FROM rkap_laba_rugi;

CREATE VIEW bi_arus_kas AS 
SELECT id, bulan, uraian, sub_uraian, jenis, value FROM arus_kas 
WHERE NOT (jenis = 'RKAP' AND EXTRACT(YEAR FROM bulan) = 2026)
UNION ALL 
SELECT id, TO_DATE(tahun::text || '-12-31', 'YYYY-MM-DD') AS bulan, uraian, sub_uraian, jenis, value FROM rkap_arus_kas;

CREATE VIEW bi_neraca AS 
SELECT id, bulan, uraian, sub_uraian, jenis, value FROM neraca 
WHERE NOT (jenis = 'RKAP' AND EXTRACT(YEAR FROM bulan) = 2026)
UNION ALL 
SELECT id, TO_DATE(tahun::text || '-12-31', 'YYYY-MM-DD') AS bulan, uraian, sub_uraian, jenis, value FROM rkap_neraca;

CREATE VIEW bi_pendapatan AS 
SELECT id, bulan, uraian, jenis, value FROM pendapatan 
WHERE NOT (jenis = 'RKAP' AND EXTRACT(YEAR FROM bulan) = 2026)
UNION ALL 
SELECT id, TO_DATE(tahun::text || '-12-31', 'YYYY-MM-DD') AS bulan, uraian, jenis, value FROM rkap_pendapatan;
