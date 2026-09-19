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
      await pool.query(`CREATE TABLE IF NOT EXISTS study_folders (
        id bigserial PRIMARY KEY, name text NOT NULL UNIQUE,
        sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
      )`);
      await pool.query(`ALTER TABLE study_folders ADD COLUMN IF NOT EXISTS parent_id bigint
        REFERENCES study_folders(id) ON DELETE RESTRICT`);
      await pool.query('ALTER TABLE study_folders DROP CONSTRAINT IF EXISTS study_folders_name_key');
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS study_folders_parent_name_unique
        ON study_folders (COALESCE(parent_id, 0), LOWER(name))`);
      await pool.query(`CREATE TABLE IF NOT EXISTS study_materials (
        id bigserial PRIMARY KEY, title text NOT NULL, description text NOT NULL DEFAULT '',
        subject text NOT NULL DEFAULT '', grade text NOT NULL DEFAULT '',
        kind text NOT NULL CHECK (kind IN ('notes', 'examples')),
        file_name text NOT NULL, mime_type text NOT NULL, file_data bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
      await pool.query(`ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS folder_id bigint
        REFERENCES study_folders(id) ON DELETE RESTRICT`);
      await pool.query(`CREATE TABLE IF NOT EXISTS study_questions (
        id bigserial PRIMARY KEY, subject text NOT NULL DEFAULT '', grade text NOT NULL DEFAULT '',
        prompt text NOT NULL, options jsonb NOT NULL, correct_index integer NOT NULL,
        explanation text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
      )`);
      await pool.query(`ALTER TABLE study_questions ADD COLUMN IF NOT EXISTS material_id bigint
        REFERENCES study_materials(id) ON DELETE SET NULL`);
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

  router.get('/folders', async (_req, res) => {
    try {
      const result = await pool.query(`SELECT f.id, f.name, f.parent_id, f.sort_order,
        COUNT(DISTINCT m.id)::integer AS material_count, COUNT(DISTINCT child.id)::integer AS child_count
        FROM study_folders f LEFT JOIN study_materials m ON m.folder_id = f.id
        LEFT JOIN study_folders child ON child.parent_id = f.id
        GROUP BY f.id ORDER BY f.sort_order, f.name`);
      const unfiled = await pool.query('SELECT COUNT(*)::integer AS material_count FROM study_materials WHERE folder_id IS NULL');
      return res.json({ folders: result.rows, unfiledCount: unfiled.rows[0].material_count });
    } catch (error) { console.error('Study folders list failed:', error); return res.status(500).json({ error: 'Could not load folders.' }); }
  });

  router.post('/folders', requireAdmin, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
    if (!name || name.length > 80) return res.status(400).json({ error: 'Enter a folder name up to 80 characters.' });
    if (parentId !== null && (!Number.isSafeInteger(parentId) || parentId < 1)) return res.status(400).json({ error: 'Choose a valid parent folder.' });
    try {
      if (parentId !== null) {
        const parent = await pool.query('SELECT id FROM study_folders WHERE id = $1', [parentId]);
        if (!parent.rowCount) return res.status(400).json({ error: 'Parent folder not found.' });
      }
      const result = await pool.query(`INSERT INTO study_folders (name, parent_id, sort_order)
        VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM study_folders WHERE parent_id IS NOT DISTINCT FROM $2), 0)) RETURNING *`, [name, parentId]);
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'That folder already exists.' });
      console.error('Study folder create failed:', error); return res.status(500).json({ error: 'Could not create folder.' });
    }
  });

  router.delete('/folders/:id', requireAdmin, async (req, res) => {
    try {
      const used = await pool.query('SELECT 1 FROM study_materials WHERE folder_id = $1 LIMIT 1', [req.params.id]);
      if (used.rowCount) return res.status(409).json({ error: 'Move or delete the files in this folder first.' });
      const children = await pool.query('SELECT 1 FROM study_folders WHERE parent_id = $1 LIMIT 1', [req.params.id]);
      if (children.rowCount) return res.status(409).json({ error: 'Move or delete the subfolders first.' });
      const result = await pool.query('DELETE FROM study_folders WHERE id = $1 RETURNING id', [req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Folder not found.' });
      return res.json({ deletedId: result.rows[0].id });
    } catch (error) { console.error('Study folder delete failed:', error); return res.status(500).json({ error: 'Could not delete folder.' }); }
  });

  router.patch('/folders/:id', requireAdmin, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const parentId = req.body?.parentId === null || req.body?.parentId === '' ? null : Number(req.body?.parentId);
    const folderId = Number(req.params.id);
    if (!name || name.length > 80 || !Number.isSafeInteger(folderId) ||
        (parentId !== null && (!Number.isSafeInteger(parentId) || parentId < 1))) {
      return res.status(400).json({ error: 'Enter a folder name and choose a valid location.' });
    }
    if (parentId === folderId) return res.status(400).json({ error: 'A folder cannot be inside itself.' });
    try {
      if (parentId !== null) {
        const invalidParent = await pool.query(`WITH RECURSIVE descendants AS (
          SELECT id FROM study_folders WHERE parent_id = $1
          UNION ALL SELECT f.id FROM study_folders f JOIN descendants d ON f.parent_id = d.id
        ) SELECT 1 FROM descendants WHERE id = $2`, [folderId, parentId]);
        if (invalidParent.rowCount) return res.status(400).json({ error: 'A folder cannot be moved inside one of its subfolders.' });
      }
      const result = await pool.query(`UPDATE study_folders SET name = $1, parent_id = $2
        WHERE id = $3 AND ($2::bigint IS NULL OR EXISTS (SELECT 1 FROM study_folders WHERE id = $2))
        RETURNING *`, [name, parentId, folderId]);
      if (!result.rowCount) return res.status(404).json({ error: 'Folder or destination not found.' });
      return res.json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'A folder with that name already exists here.' });
      console.error('Study folder update failed:', error); return res.status(500).json({ error: 'Could not update folder.' });
    }
  });

  router.get('/materials', async (_req, res) => {
    try {
      const result = await pool.query(`SELECT m.id, m.title, m.description, m.subject, m.grade, m.kind,
        m.file_name, m.mime_type, m.folder_id, f.name AS folder_name, m.created_at
        FROM study_materials m LEFT JOIN study_folders f ON f.id = m.folder_id ORDER BY m.created_at DESC, m.id DESC`);
      return res.json(result.rows);
    } catch (error) { console.error('Study materials list failed:', error); return res.status(500).json({ error: 'Could not load materials.' }); }
  });

  router.post('/materials', requireAdmin, (req, res) => {
    upload(req, res, async (uploadError) => {
      if (uploadError) return res.status(400).json({ error: 'Upload failed. The file must be 8 MB or smaller.' });
      const { title, description = '', subject = '', grade = '', kind } = req.body || {};
      const folderId = Number(req.body?.folderId);
      if (!req.file || !acceptedTypes.has(req.file.mimetype)) return res.status(400).json({ error: 'Choose a PDF, image, or Word document.' });
      if (!['notes', 'examples'].includes(kind) || !title?.trim() || title.length > 160 ||
          description.length > 1000 || subject.length > 80 || grade.length > 40 || !Number.isSafeInteger(folderId) || folderId < 1) {
        return res.status(400).json({ error: 'Enter a title, type, and valid details.' });
      }
      try {
        const folder = await pool.query('SELECT id FROM study_folders WHERE id = $1', [folderId]);
        if (!folder.rowCount) return res.status(400).json({ error: 'Choose a folder.' });
        const safeName = String(req.file.originalname || 'material').replace(/[\\/\r\n\0]/g, '').slice(0, 180);
        const result = await pool.query(`INSERT INTO study_materials
          (title, description, subject, grade, kind, file_name, mime_type, file_data, folder_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          RETURNING id, title, description, subject, grade, kind, file_name, mime_type, folder_id, created_at`,
          [title.trim(), description.trim(), subject.trim(), grade.trim(), kind, safeName, req.file.mimetype, req.file.buffer, folderId]);
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

  router.patch('/materials/:id/folder', requireAdmin, async (req, res) => {
    const folderId = Number(req.body?.folderId);
    if (!Number.isSafeInteger(folderId) || folderId < 1) return res.status(400).json({ error: 'Choose a folder.' });
    try {
      const result = await pool.query(`UPDATE study_materials SET folder_id = $1
        WHERE id = $2 AND EXISTS (SELECT 1 FROM study_folders WHERE id = $1) RETURNING id, folder_id`, [folderId, req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Material or folder not found.' });
      return res.json(result.rows[0]);
    } catch (error) { console.error('Study material move failed:', error); return res.status(500).json({ error: 'Could not move material.' }); }
  });

  router.patch('/materials/:id', requireAdmin, async (req, res) => {
    const { title, description = '', subject = '', grade = '', kind } = req.body || {};
    const folderId = Number(req.body?.folderId);
    if (!['notes', 'examples'].includes(kind) || !title?.trim() || title.length > 160 ||
        description.length > 1000 || subject.length > 80 || grade.length > 40 ||
        !Number.isSafeInteger(folderId) || folderId < 1) {
      return res.status(400).json({ error: 'Enter a title, type, folder, and valid details.' });
    }
    try {
      if (kind === 'examples') {
        const linkedQuestions = await pool.query('SELECT 1 FROM study_questions WHERE material_id = $1 LIMIT 1', [req.params.id]);
        if (linkedQuestions.rowCount) return res.status(409).json({ error: 'Move or delete the linked practice questions before changing this note to a worked example.' });
      }
      const result = await pool.query(`UPDATE study_materials SET title = $1, description = $2,
        subject = $3, grade = $4, kind = $5, folder_id = $6
        WHERE id = $7 AND EXISTS (SELECT 1 FROM study_folders WHERE id = $6)
        RETURNING id, title, description, subject, grade, kind, folder_id`,
        [title.trim(), description.trim(), subject.trim(), grade.trim(), kind, folderId, req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Material or folder not found.' });
      return res.json(result.rows[0]);
    } catch (error) { console.error('Study material update failed:', error); return res.status(500).json({ error: 'Could not update material.' }); }
  });

  router.get('/questions', async (req, res) => {
    try {
      const columns = req.studyUser.role === 'admin'
        ? 'q.id, q.subject, q.grade, q.prompt, q.options, q.correct_index, q.explanation, q.created_at, q.material_id, m.title AS material_title'
        : 'q.id, q.subject, q.grade, q.prompt, q.options, q.created_at, q.material_id, m.title AS material_title';
      const result = await pool.query(`SELECT ${columns} FROM study_questions q
        LEFT JOIN study_materials m ON m.id = q.material_id ORDER BY q.created_at DESC, q.id DESC`);
      return res.json(result.rows);
    } catch (error) { console.error('Study questions list failed:', error); return res.status(500).json({ error: 'Could not load questions.' }); }
  });

  router.post('/questions', requireAdmin, async (req, res) => {
    const { subject = '', grade = '', prompt, options, correctIndex, explanation = '', materialId } = req.body || {};
    const noteId = Number(materialId);
    if (!prompt?.trim() || prompt.length > 1000 || !Array.isArray(options) || options.length < 2 || options.length > 4 ||
        options.some((option) => typeof option !== 'string' || !option.trim() || option.length > 300) ||
        !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length ||
        subject.length > 80 || grade.length > 40 || explanation.length > 1000 || !Number.isSafeInteger(noteId) || noteId < 1) {
      return res.status(400).json({ error: 'Choose a note, enter a question, 2–4 choices, and the correct choice.' });
    }
    try {
      const note = await pool.query(`SELECT id FROM study_materials WHERE id = $1 AND kind = 'notes'`, [noteId]);
      if (!note.rowCount) return res.status(400).json({ error: 'Choose a note from the library.' });
      const result = await pool.query(`INSERT INTO study_questions (subject, grade, prompt, options, correct_index, explanation, material_id)
        VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7) RETURNING *`,
        [subject.trim(), grade.trim(), prompt.trim(), JSON.stringify(options.map((value) => value.trim())), correctIndex, explanation.trim(), noteId]);
      return res.status(201).json(result.rows[0]);
    } catch (error) { console.error('Study question create failed:', error); return res.status(500).json({ error: 'Could not save question.' }); }
  });

  router.patch('/questions/:id/note', requireAdmin, async (req, res) => {
    const noteId = Number(req.body?.materialId);
    if (!Number.isSafeInteger(noteId) || noteId < 1) return res.status(400).json({ error: 'Choose a note.' });
    try {
      const note = await pool.query(`SELECT id FROM study_materials WHERE id = $1 AND kind = 'notes'`, [noteId]);
      if (!note.rowCount) return res.status(400).json({ error: 'Choose a note from the library.' });
      const result = await pool.query('UPDATE study_questions SET material_id = $1 WHERE id = $2 RETURNING id, material_id', [noteId, req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Question not found.' });
      return res.json(result.rows[0]);
    } catch (error) { console.error('Study question link failed:', error); return res.status(500).json({ error: 'Could not link question.' }); }
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
