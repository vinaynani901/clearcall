const express = require('express');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { newId } = require('../utils/ids');
const { hasFeature, checkCountLimit } = require('../services/featureFlags');

const router = express.Router();

function requireJobseeker(req, res, next) {
  if (req.user.role !== 'jobseeker') return res.status(403).json({ error: 'Job seeker account required' });
  next();
}
router.use(authMiddleware, requireJobseeker);

function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    template: row.template,
    personalDetails: JSON.parse(row.personal_details || '{}'),
    summary: row.summary || '',
    experience: JSON.parse(row.experience || '[]'),
    education: JSON.parse(row.education || '[]'),
    skills: JSON.parse(row.skills || '[]'),
    certifications: JSON.parse(row.certifications || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/resumes — list this job seeker's built resumes, most recently
// updated first, each flagged with whether it's the current profile resume.
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM resumes WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
  const user = db.prepare('SELECT profile_resume_type, profile_resume_id FROM users WHERE id = ?').get(req.user.id);
  const resumes = rows.map((r) => ({
    ...serialize(r),
    isProfileResume: user.profile_resume_type === 'built' && user.profile_resume_id === r.id,
  }));
  res.json({ resumes });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Resume not found' });
  res.json({ resume: serialize(row) });
});

// POST /api/resumes — create a new built resume (from scratch, or from a
// chosen template — the template just preselects the layout/styling used
// at PDF/Word export time, the sections are always the same six).
router.post('/', (req, res) => {
  if (!hasFeature('user', req.user.id, 'resume_builder')) {
    return res.status(403).json({ error: 'The Resume Builder requires the Premium plan.', featureLocked: true, feature: 'resume_builder' });
  }

  const builtCount = db.prepare('SELECT COUNT(*) as n FROM resumes WHERE user_id = ?').get(req.user.id).n;
  const hasUploaded = db.prepare('SELECT resume_path FROM users WHERE id = ?').get(req.user.id).resume_path ? 1 : 0;
  const check = checkCountLimit('user', req.user.id, 'resume_uploads_limit', builtCount + hasUploaded);
  if (!check.allowed) {
    return res.status(403).json({
      error: `Your plan allows up to ${check.limit} resume${check.limit === 1 ? '' : 's'} (uploaded + built combined). Upgrade to save more.`,
      featureLocked: true,
      feature: 'resume_uploads_limit',
    });
  }

  const { name, template } = req.body;
  const validTemplates = ['professional', 'modern', 'graduate'];
  const chosenTemplate = validTemplates.includes(template) ? template : 'professional';

  const id = newId('resume');
  db.prepare(`
    INSERT INTO resumes (id, user_id, name, template) VALUES (?, ?, ?, ?)
  `).run(id, req.user.id, (name || 'Untitled Resume').trim(), chosenTemplate);

  const row = db.prepare('SELECT * FROM resumes WHERE id = ?').get(id);
  res.status(201).json({ resume: serialize(row) });
});

// PUT /api/resumes/:id — save the six sections. Each is stored as JSON;
// the frontend builder sends whatever shape it's been editing (arrays of
// repeatable entries for experience/education/certifications, a flat
// object for personalDetails, a plain string list for skills).
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Resume not found' });

  const { name, template, personalDetails, summary, experience, education, skills, certifications } = req.body;
  const validTemplates = ['professional', 'modern', 'graduate'];

  db.prepare(`
    UPDATE resumes SET
      name = ?, template = ?, personal_details = ?, summary = ?,
      experience = ?, education = ?, skills = ?, certifications = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name ? name.trim() : existing.name,
    validTemplates.includes(template) ? template : existing.template,
    personalDetails !== undefined ? JSON.stringify(personalDetails) : existing.personal_details,
    summary !== undefined ? summary : existing.summary,
    experience !== undefined ? JSON.stringify(experience) : existing.experience,
    education !== undefined ? JSON.stringify(education) : existing.education,
    skills !== undefined ? JSON.stringify(skills) : existing.skills,
    certifications !== undefined ? JSON.stringify(certifications) : existing.certifications,
    req.params.id
  );

  const row = db.prepare('SELECT * FROM resumes WHERE id = ?').get(req.params.id);
  res.json({ resume: serialize(row) });
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Resume not found' });
  db.prepare('DELETE FROM resumes WHERE id = ?').run(req.params.id);
  // If this was the profile resume, fall back to "no built resume selected"
  // rather than leaving a dangling reference.
  db.prepare("UPDATE users SET profile_resume_type = 'uploaded', profile_resume_id = NULL WHERE id = ? AND profile_resume_id = ?").run(req.user.id, req.params.id);
  res.json({ message: 'Resume deleted' });
});

// POST /api/resumes/:id/set-profile — marks this built resume as the one
// automatically attached to job applications.
router.post('/:id/set-profile', (req, res) => {
  const existing = db.prepare('SELECT id FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Resume not found' });
  db.prepare("UPDATE users SET profile_resume_type = 'built', profile_resume_id = ? WHERE id = ?").run(req.params.id, req.user.id);
  res.json({ message: 'Set as your profile resume' });
});

function fullName(personalDetails) {
  return personalDetails.fullName || 'Unnamed';
}

// GET /api/resumes/:id/pdf — renders the resume as a real PDF from the
// structured section data, using pdfkit. Simple, clean, single-column
// layout shared across all three templates for now (the template field
// mainly differentiates the on-screen preview) — a real from-scratch
// generated PDF beats a fake "coming soon" placeholder.
router.get('/:id/pdf', (req, res) => {
  const row = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Resume not found' });
  const resume = serialize(row);
  const pd = resume.personalDetails;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fullName(pd).replace(/[^a-z0-9]+/gi, '_')}_Resume.pdf"`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(22).fillColor('#1e3a8a').text(fullName(pd), { align: 'left' });
  const contactLine = [pd.email, pd.phone, pd.location].filter(Boolean).join('  ·  ');
  if (contactLine) doc.fontSize(10).fillColor('#64748b').text(contactLine);
  doc.moveDown(1);

  if (resume.summary) {
    doc.fontSize(13).fillColor('#1e3a8a').text('Professional Summary');
    doc.fontSize(10).fillColor('#0f172a').text(resume.summary);
    doc.moveDown(1);
  }

  if (resume.experience.length > 0) {
    doc.fontSize(13).fillColor('#1e3a8a').text('Work Experience');
    resume.experience.forEach((e) => {
      doc.fontSize(11).fillColor('#0f172a').text(`${e.role || ''} — ${e.company || ''}`.trim());
      const dates = [e.startDate, e.endDate || 'Present'].filter(Boolean).join(' – ');
      if (dates) doc.fontSize(9).fillColor('#64748b').text(dates);
      if (e.description) doc.fontSize(10).fillColor('#334155').text(e.description);
      doc.moveDown(0.6);
    });
    doc.moveDown(0.4);
  }

  if (resume.education.length > 0) {
    doc.fontSize(13).fillColor('#1e3a8a').text('Education');
    resume.education.forEach((e) => {
      doc.fontSize(11).fillColor('#0f172a').text(`${e.qualification || ''} — ${e.institution || ''}`.trim());
      const dates = [e.startDate, e.endDate].filter(Boolean).join(' – ');
      if (dates) doc.fontSize(9).fillColor('#64748b').text(dates);
      doc.moveDown(0.6);
    });
    doc.moveDown(0.4);
  }

  if (resume.skills.length > 0) {
    doc.fontSize(13).fillColor('#1e3a8a').text('Skills');
    doc.fontSize(10).fillColor('#0f172a').text(resume.skills.join('  ·  '));
    doc.moveDown(1);
  }

  if (resume.certifications.length > 0) {
    doc.fontSize(13).fillColor('#1e3a8a').text('Certifications');
    resume.certifications.forEach((c) => {
      doc.fontSize(10).fillColor('#0f172a').text(`${c.name || ''}${c.issuer ? ` — ${c.issuer}` : ''}${c.year ? ` (${c.year})` : ''}`);
    });
  }

  doc.end();
});

// GET /api/resumes/:id/docx — same content, real .docx via the `docx`
// package (pure JS, no native/system Word dependency).
router.get('/:id/docx', async (req, res) => {
  const row = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Resume not found' });
  const resume = serialize(row);
  const pd = resume.personalDetails;

  const children = [
    new Paragraph({ text: fullName(pd), heading: HeadingLevel.TITLE }),
  ];
  const contactLine = [pd.email, pd.phone, pd.location].filter(Boolean).join('  ·  ');
  if (contactLine) children.push(new Paragraph({ children: [new TextRun({ text: contactLine, color: '64748b' })] }));

  if (resume.summary) {
    children.push(new Paragraph({ text: 'Professional Summary', heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ text: resume.summary }));
  }

  if (resume.experience.length > 0) {
    children.push(new Paragraph({ text: 'Work Experience', heading: HeadingLevel.HEADING_2 }));
    resume.experience.forEach((e) => {
      children.push(new Paragraph({ children: [new TextRun({ text: `${e.role || ''} — ${e.company || ''}`.trim(), bold: true })] }));
      const dates = [e.startDate, e.endDate || 'Present'].filter(Boolean).join(' – ');
      if (dates) children.push(new Paragraph({ children: [new TextRun({ text: dates, color: '64748b', size: 18 })] }));
      if (e.description) children.push(new Paragraph({ text: e.description }));
    });
  }

  if (resume.education.length > 0) {
    children.push(new Paragraph({ text: 'Education', heading: HeadingLevel.HEADING_2 }));
    resume.education.forEach((e) => {
      children.push(new Paragraph({ children: [new TextRun({ text: `${e.qualification || ''} — ${e.institution || ''}`.trim(), bold: true })] }));
      const dates = [e.startDate, e.endDate].filter(Boolean).join(' – ');
      if (dates) children.push(new Paragraph({ children: [new TextRun({ text: dates, color: '64748b', size: 18 })] }));
    });
  }

  if (resume.skills.length > 0) {
    children.push(new Paragraph({ text: 'Skills', heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ text: resume.skills.join('  ·  ') }));
  }

  if (resume.certifications.length > 0) {
    children.push(new Paragraph({ text: 'Certifications', heading: HeadingLevel.HEADING_2 }));
    resume.certifications.forEach((c) => {
      children.push(new Paragraph({ text: `${c.name || ''}${c.issuer ? ` — ${c.issuer}` : ''}${c.year ? ` (${c.year})` : ''}` }));
    });
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${fullName(pd).replace(/[^a-z0-9]+/gi, '_')}_Resume.docx"`);
  res.send(buffer);
});

module.exports = router;
