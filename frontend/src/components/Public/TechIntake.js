import React, { useState } from "react";
import "../../TutoringIntake.css";
import { useNavigate } from "react-router-dom";

const TechIntakeForm = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ fullName: "", email: "", phone: "", haveBooked: "", helpType: "", platform: "", experienceLevel: "", deadline: "", paymentMethod: "", additionalDetails: "" });
  const handleChange = ({ target: { name, value } }) => {
    setFormData((previous) => ({ ...previous, [name]: value }));
    if (name === "haveBooked" && value === "yes") navigate("/client-scheduling");
  };
  const handleSubmit = async (event) => {
    event.preventDefault(); setIsSubmitting(true);
    const apiUrl = process.env.NODE_ENV === "production" ? "" : process.env.REACT_APP_API_URL || "http://localhost:3001";
    try {
      const response = await fetch(`${apiUrl}/api/tech-intake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData) });
      if (!response.ok) throw new Error("Failed to submit the form");
      const params = new URLSearchParams();
      [["name", formData.fullName], ["email", formData.email], ["phone", formData.phone], ["paymentMethod", formData.paymentMethod]].forEach(([key, value]) => value && params.append(key, value));
      params.append("appointmentType", "Developer Consultation (30 min)");
      navigate(`/client-scheduling?${params.toString()}`);
    } catch (error) { console.error(error); alert("We couldn't submit your request. Please try again."); }
    finally { setIsSubmitting(false); }
  };
  return <main className="pathway-page pathway-page--tech">
    <section className="pathway-hero"><div className="pathway-hero__copy"><span className="pathway-kicker">Tech &amp; engineering support</span><h1>Turn the idea into something that works.</h1><p>Get practical, one-on-one help with coding, websites, technical projects, and engineering concepts—at your pace.</p><div className="pathway-trust-row"><span>1:1 guidance</span><span>Beginner friendly</span><span>Project focused</span></div></div><aside className="pathway-summary"><span className="pathway-summary__eyebrow">What happens next</span><ol><li><b>Share the project</b><small>Tell me where you are and where you feel stuck.</small></li><li><b>Choose a time</b><small>Continue directly to the scheduling page.</small></li><li><b>Build together</b><small>Leave with clear progress and next steps.</small></li></ol></aside></section>
    <section className="pathway-form-shell"><div className="pathway-form-heading"><div><span className="pathway-step">Quick project intake</span><h2>Tell me what you’re working on</h2><p>This takes about two minutes. Required fields are marked with an asterisk.</p></div><span className="pathway-time">About 2 min</span></div>
      <form onSubmit={handleSubmit} className="pathway-form"><FormSection number="1" title="Have we worked together before?"><Field label="Booking history *"><select name="haveBooked" value={formData.haveBooked} onChange={handleChange} required><option value="">Choose an answer</option><option value="yes">Yes, take me to scheduling</option><option value="no">No, this is my first request</option></select></Field></FormSection>
      {formData.haveBooked === "no" && <><FormSection number="2" title="Your contact details" hint="Used only to follow up about this request and appointment."><div className="pathway-field-grid"><Field label="Full name *"><input name="fullName" value={formData.fullName} onChange={handleChange} autoComplete="name" placeholder="Your full name" required /></Field><Field label="Email *"><input type="email" name="email" value={formData.email} onChange={handleChange} autoComplete="email" placeholder="you@example.com" required /></Field><Field wide label="Phone *"><input type="tel" name="phone" value={formData.phone} onChange={handleChange} autoComplete="tel" placeholder="(555) 555-5555" required /></Field></div></FormSection>
      <FormSection number="3" title="Project snapshot" hint="A little context helps us make the first session productive."><div className="pathway-field-grid"><Field wide label="What do you need help with? *"><input name="helpType" value={formData.helpType} onChange={handleChange} placeholder="Build a website, debug code, learn Python…" required /></Field><Field label="Language or platform *"><input name="platform" value={formData.platform} onChange={handleChange} placeholder="JavaScript, Python, WordPress…" required /></Field><Field label="Experience level *"><select name="experienceLevel" value={formData.experienceLevel} onChange={handleChange} required><option value="">Choose a level</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></Field><Field label="Project deadline"><input type="date" name="deadline" value={formData.deadline} onChange={handleChange} /></Field><Field label="Payment preference *"><select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange} required><option value="">Choose a method</option><option value="Square">Square — payment link</option><option>Zelle</option><option value="Cashapp">Cash App</option></select></Field><Field wide label="Anything else I should know?"><textarea name="additionalDetails" value={formData.additionalDetails} onChange={handleChange} placeholder="Share links, goals, roadblocks, or important context." rows="5" /></Field></div></FormSection></>}
      <div className="pathway-submit"><div><b>Ready for the next step?</b><span>You’ll choose your appointment immediately after submitting.</span></div><button type="submit" disabled={isSubmitting || !formData.haveBooked}>{isSubmitting ? "Sending request…" : "Submit & choose a time"}<span>→</span></button></div></form>
    </section></main>;
};
const FormSection = ({ number, title, hint, children }) => <div className="pathway-section"><div className="pathway-section__number">{number}</div><div className="pathway-section__body"><h3>{title}</h3>{hint && <p className="pathway-section__hint">{hint}</p>}{children}</div></div>;
const Field = ({ label, wide, children }) => <label className={wide ? "pathway-field--wide" : ""}><span>{label}</span>{children}</label>;
export default TechIntakeForm;
