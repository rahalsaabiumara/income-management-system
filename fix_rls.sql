-- Mengizinkan akses SELECT (baca) ke semua pengguna (anon dan authenticated)
CREATE POLICY "Allow public read access" ON laba_rugi FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON arus_kas FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON neraca FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON pendapatan FOR SELECT USING (true);

-- Pastikan RLS tetap aktif tapi policy di atas mengizinkan baca
ALTER TABLE laba_rugi ENABLE ROW LEVEL SECURITY;
ALTER TABLE arus_kas ENABLE ROW LEVEL SECURITY;
ALTER TABLE neraca ENABLE ROW LEVEL SECURITY;
ALTER TABLE pendapatan ENABLE ROW LEVEL SECURITY;
