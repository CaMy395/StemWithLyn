import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';

const acceptedTypes = new Map([
  ['application/pdf', '.pdf'],
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
]);

export default function createStudyLibraryRouter(pool, tokenSecret) {
  const router = express.Router();
  let schemaPromise;
  const ensureSchema = () => {
    if (!schemaPromise) schemaPromise = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS study_materials (
        id bigserial PRIMARY KEY, title text NOT NULL, description text NOT NULL DEFAULT '',
        subject text NOT NULL DEFAULT '', grade text NOT NULL DEFAULT '',
        kind text NOT NULL CHECK (kind IN ('notes', 'examples')),
        file_name text NOT NULL, mime_type text NOT NULL, file_data bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS study_questions (
        id bigserial PRIMARY KEY, subject text NOT NULL DEFAULT '', grade text NOT NULL DEFAULT '',
        prompt text NOT NULL, options jsonb NOT NULL, correct_index integer NOT NULL,
        explanation text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
      )`);
    })().catch((error) => { schemaPromise = null; throw error; });
    return schemaPromise;
  };

  router.use(async (req, res, next) => {
    try {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const payload = jwt.verify(token, tokenSecret);
      const result = await pool.query('SELECT id, role FROM users WHERE id = $1 LIMIT 1', [payload.userId]);
      if (!result.rowCount) return res.status(401).json({ error: 'Please sign in again.' });
      req.studyUser = result.rows[0];
      await ensureSchema();
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return res.status(401).json({ error: 'Please sign in again.' });
      console.error('Study library setup failed:', error);
      return res.status(500).json({ error: 'Study library is unavailable.' });
    }
  });

  const requireAdmin = (req, res, next) => req.studyUser.role === 'admin'
    ? next() : res.status(403).json({ error: 'Admin access required.' });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => callback(null, acceptedTypes.has(file.mimetype)),
  }).single('file');

  router.get('/materials', async (_req, res) => {
    try {
      const result = await pool.query(`SELECT id, title, description, subject, grade, kind, file_name, mime_type, created_at
        FROM study_materials ORDER BY created_at DESC, id DESC`);
      return res.json(result.rows);
    } catch (error) { console.error('Study materials list failed:', error); return res.status(500).json({ error: 'Could not load materials.' }); }
  });

  router.post('/materials', requireAdmin, (req, res) => {
    upload(req, res, async (uploadError) => {
      if (uploadError) return res.status(400).json({ error: 'Upload failed. The file must be 8 MB or smaller.' });
      const { title, description = '', subject = '', grade = '', kind } = req.body || {};
      if (!req.file || !acceptedTypes.has(req.file.mimetype)) return res.status(400).json({ error: 'Choose a PDF, image, or Word document.' });
      if (!['notes', 'examples'].includes(kind) || !title?.trim() || title.length > 160 ||
          description.length > 1000 || subject.length > 80 || grade.length > 40) {
        return res.status(400).json({ error: 'Enter a title, type, and valid details.' });
      }
      try {
        const safeName = String(req.file.originalname || 'material').replace(/[\\/\r\n\0]/g, '').slice(0, 180);
        const result = await pool.query(`INSERT INTO study_materials
          (title, description, subject, grade, kind, file_name, mime_type, file_data)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          RETURNING id, title, description, subject, grade, kind, file_name, mime_type, created_at`,
          [title.trim(), description.trim(), subject.trim(), grade.trim(), kind, safeName, req.file.mimetype, req.file.buffer]);
        return res.status(201).json(result.rows[0]);
      } catch (error) { console.error('Study material upload failed:', error); return res.status(500).json({ error: 'Could not save material.' }); }
    });
  });

  router.get('/materials/:id/file', async (req, res) => {
    try {
      const result = await pool.query('SELECT file_name, mime_type, file_data FROM study_materials WHERE id = $1', [req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Material not found.' });
      const file = result.rows[0];
      res.setHeader('Content-Type', file.mime_type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Disposition', `${file.mime_type.includes('wordprocessingml') ? 'attachment' : 'inline'}; filename="study-material"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`);
      return res.send(file.file_data);
    } catch (error) { console.error('Study material download failed:', error); return res.status(500).json({ error: 'Could not open material.' }); }
  });

  router.delete('/materials/:id', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM study_materials WHERE id = $1 RETURNING id', [req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Material not found.' });
      return res.json({ deletedId: result.rows[0].id });
    } catch (error) { console.error('Study material delete failed:', error); return res.status(500).json({ error: 'Could not delete material.' }); }
  });

  router.get('/questions', async (req, res) => {
    try {
      const columns = req.studyUser.role === 'admin'
        ? 'id, subject, grade, prompt, options, correct_index, explanation, created_at'
        : 'id, subject, grade, prompt, options, created_at';
      const result = await pool.query(`SELECT ${columns} FROM study_questions ORDER BY created_at DESC, id DESC`);
      return res.json(result.rows);
    } catch (error) { console.error('Study questions list failed:', error); return res.status(500).json({ error: 'Could not load questions.' }); }
  });

  router.post('/questions', requireAdmin, async (req, res) => {
    const { subject = '', grade = '', prompt, options, correctIndex, explanation = '' } = req.body || {};
    if (!prompt?.trim() || prompt.length > 1000 || !Array.isArray(options) || options.length < 2 || options.length > 4 ||
        options.some((option) => typeof option !== 'string' || !option.trim() || option.length > 300) ||
        !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length ||
        subject.length > 80 || grade.length > 40 || explanation.length > 1000) {
      return res.status(400).json({ error: 'Enter a question, 2–4 choices, the correct choice, and valid details.' });
    }
    try {
      const result = await pool.query(`INSERT INTO study_questions (subject, grade, prompt, options, correct_index, explanation)
        VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING *`,
        [subject.trim(), grade.trim(), prompt.trim(), JSON.stringify(options.map((value) => value.trim())), correctIndex, explanation.trim()]);
      return res.status(201).json(result.rows[0]);
    } catch (error) { console.error('Study question create failed:', error); return res.status(500).json({ error: 'Could not save question.' }); }
  });

  router.post('/questions/:id/check', async (req, res) => {
    const answer = req.body?.answer;
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) return res.status(400).json({ error: 'Choose an answer.' });
    try {
      const result = await pool.query('SELECT correct_index, explanation FROM study_questions WHERE id = $1', [req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Question not found.' });
      return res.json({ correct: answer === result.rows[0].correct_index, correctIndex: result.rows[0].correct_index, explanation: result.rows[0].explanation });
    } catch (error) { console.error('Study answer check failed:', error); return res.status(500).json({ error: 'Could not check answer.' }); }
  });

  router.delete('/questions/:id', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM study_questions WHERE id = $1 RETURNING id', [req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Question not found.' });
      return res.json({ deletedId: result.rows[0].id });
    } catch (error) { console.error('Study question delete failed:', error); return res.status(500).json({ error: 'Could not delete question.' }); }
  });

  return router;
}
