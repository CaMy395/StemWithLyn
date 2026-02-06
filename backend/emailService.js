import nodemailer from "nodemailer";
import "dotenv/config";
import path from "path";
import fs from "fs";

/* ======================================================
   Helpers
====================================================== */

const formatTime = (time) => {
  if (!time || typeof time !== "string") return "N/A";
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  }).format(date);
};

const safeJoinRecipients = (arr) =>
  Array.from(new Set((arr || []).filter(Boolean))).join(",");

/* ======================================================
   ONE (or TWO) SHARED TRANSPORTERS
   - EMAIL_* is your main sender (stemwithlyn@gmail.com)
   - ADMIN_* is optional; if not set, we fall back to EMAIL_*
====================================================== */

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// Optional separate admin creds (if you really use them)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || EMAIL_USER;
const ADMIN_PASS = process.env.ADMIN_PASS || EMAIL_PASS;

// Main transporter (used for most emails)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // ✅ fixes Render self-signed chain issues
  },
});

// Admin transporter (only used if you want separate sender creds)
const adminTransporter =
  ADMIN_EMAIL === EMAIL_USER && ADMIN_PASS === EMAIL_PASS
    ? transporter
    : nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: ADMIN_EMAIL,
          pass: ADMIN_PASS,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

/* ======================================================
   Password Reset Email
====================================================== */

const sendResetEmail = async (email, resetLink) => {
  const mailOptions = {
    from: EMAIL_USER,
    to: email,
    subject: "Password Reset Request",
    html: `
      <h3>Password Reset</h3>
      <p>Click the link below to reset your password:</p>
      <a href="${resetLink}">${resetLink}</a>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Reset email sent:", info.response);
  } catch (error) {
    console.error("❌ Error sending reset email:", error);
  }
};

export { sendResetEmail };

/* ======================================================
   Registration Email
====================================================== */

const sendRegistrationEmail = async (recipient, username, name) => {
  const mailOptions = {
    from: ADMIN_EMAIL,
    to: recipient,
    subject: "Welcome to Our Platform!",
    html: `
      <p>Hello ${name},</p>
      <p>Welcome to our platform! Your account has been created successfully.</p>
      <p><strong>Username:</strong> ${username}</p>
      <p><strong>Email:</strong> ${recipient}</p>
      <p>Thank you for registering with us.</p>
      <p>Best regards,</p>
      <p>Your Team</p>
    `,
  };

  try {
    const info = await adminTransporter.sendMail(mailOptions);
    console.log(`✅ Registration email sent to ${recipient}: ${info.response}`);
  } catch (error) {
    console.error(`❌ Error sending registration email to ${recipient}:`, error.message);
  }
};

export { sendRegistrationEmail };

/* ======================================================
   Send Portal Invite Email
====================================================== */

const sendPortalInviteEmail = async (email, full_name) => {
  const resetUrl =
    `${process.env.REACT_APP_API_URL || "http://localhost:3000"}/forgot-password`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your STEM with Lyn Portal Login",
    html: `
      <p>Hello ${full_name || ""},</p>
      <p>Your client portal is ready.</p>
      <p>To set your password, click <b>Forgot Password</b> here:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>– STEM with Lyn</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Portal invite email sent to ${email}`);
  } catch (error) {
    console.error("❌ Error sending portal invite email:", error.message);
  }
};

export { sendPortalInviteEmail };

/* ======================================================
   Tutoring Intake Email
====================================================== */

const sendTutoringIntakeEmail = async (formData) => {
  const additionalRecipient =
    formData.whyHelp === "United Mentors Organization"
      ? "stemwithlyn@gmail.com"
      : null;

  const recipients = [EMAIL_USER];
  if (additionalRecipient) recipients.push(additionalRecipient);

  const mailOptions = {
    from: EMAIL_USER,
    to: safeJoinRecipients(recipients),
    subject: `Tutoring Intake Form Submission`,
    html: `
      <h3>Tutoring Intake Form Submission</h3>
      <p><strong>Full Name:</strong> ${formData.fullName}</p>
      <p><strong>Email:</strong> ${formData.email}</p>
      <p><strong>Phone:</strong> ${formData.phone}</p>
      <p><strong>Have Booked Before:</strong> ${formData.haveBooked}</p>
      <p><strong>Service Requested:</strong> ${formData.whyHelp}</p>
      ${
        formData.learnDisable
          ? `<p><strong>Learning Disability:</strong> ${formData.whatDisable || "None"}</p>`
          : ""
      }
      <p><strong>Age:</strong> ${formData.age}</p>
      <p><strong>Grade:</strong> ${formData.grade}</p>
      <p><strong>Subject:</strong> ${formData.subject}</p>
      ${
        formData.subject === "Math"
          ? `<p><strong>Math Subject:</strong> ${formData.mathSubject}</p>`
          : formData.subject === "Science"
          ? `<p><strong>Science Subject:</strong> ${formData.scienceSubject}</p>`
          : ""
      }
      <p><strong>Current Grade:</strong> ${formData.currentGrade}</p>
      <p><strong>Payment Method:</strong> ${formData.paymentMethod}</p>
      <p><strong>Additional Details:</strong> ${formData.additionalDetails || "None"}</p>
    `,
  };

  try {
    console.log("Final recipients:", recipients);
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Tutoring intake email sent: ${info.response}`);
  } catch (error) {
    console.error(`❌ Error sending tutoring intake email: ${error.message}`);
  }
};

export { sendTutoringIntakeEmail };

/* ======================================================
   Payment Link Email
====================================================== */

const sendPaymentEmail = async (email, link) => {
  const mailOptions = {
    from: EMAIL_USER,
    to: email,
    subject: "Payment Link",
    html: `<p>Please complete your payment using the following link:</p>
           <a href="${link}" target="_blank">${link}</a>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Payment link sent to ${email}`);
  } catch (error) {
    console.error(`❌ Error sending payment link to ${email}:`, error.message);
  }
};

export { sendPaymentEmail };

/* ======================================================
   Appointment Scheduled Email
====================================================== */

const sendTutoringApptEmail = async ({
  title,
  email,
  full_name,
  date,
  time,
  end_time,
  description,
}) => {
  const adminEmail = "stemwithlyn@gmail.com";
  const additionalRecipient = String(title || "")
    .toLowerCase()
    .includes("united mentors")
    ? "unitedmentorsllc@gmail.com"
    : null;

  const recipients = [email, adminEmail];
  if (additionalRecipient) recipients.push(additionalRecipient);

  const mailOptions = {
    from: EMAIL_USER,
    to: recipients,
    subject: `New Appointment Scheduled: ${title}`,
    html: `
      <p>Hello ${full_name},</p>
      <p>Your appointment has been scheduled. If you need to cancel or reschedule, please reply to this email.</p>
      <p><strong>Details:</strong></p>
      <ul>
        <li><strong>Title:</strong> ${title}</li>
        <li><strong>Date:</strong> ${date}</li>
        <li><strong>Time:</strong> ${formatTime(time)} - ${end_time ? formatTime(end_time) : "TBD"}</li>
        <li><strong>Description:</strong> ${description || "No additional details"}</li>
      </ul>
      <p>If you have a virtual meeting, please join here:</p>
      <p>Caitlyn Myland is inviting you to a scheduled Zoom meeting.</p>
      <p><strong>Topic:</strong> Stem with Lyn Meeting Room</p>
      <p><strong>Join Zoom Meeting:</strong></p>
      <p><a href="https://us06web.zoom.us/j/3697746091?pwd=YXkyaUhKM3AzKzJpcitUNWRCMjNOdz09">
        https://us06web.zoom.us/j/3697746091?pwd=YXkyaUhKM3AzKzJpcitUNWRCMjNOdz09</a></p>
      <p><strong>Meeting ID:</strong> 369 774 6091</p>
      <p><strong>Passcode:</strong> Lyn</p>
      <p>Thank you!</p>
      <p>Best regards,<br/>Your Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Appointment email sent to: ${safeJoinRecipients(recipients)}`);
  } catch (error) {
    console.error(`❌ Error sending appointment email:`, error.message);
  }
};

export { sendTutoringApptEmail };

/* ======================================================
   Appointment Reschedule Email
====================================================== */

const sendTutoringRescheduleEmail = async ({
  title,
  email,
  full_name,
  old_date,
  old_time,
  new_date,
  new_time,
  end_time,
  description,
}) => {
  const adminEmail = "stemwithlyn@gmail.com";
  const additionalRecipient = String(title || "")
    .toLowerCase()
    .includes("united mentors")
    ? "unitedmentorsllc@gmail.com"
    : null;

  const recipients = [email, adminEmail];
  if (additionalRecipient) recipients.push(additionalRecipient);

  const mailOptions = {
    from: EMAIL_USER,
    to: recipients,
    subject: `Appointment Rescheduled: ${title}`,
    html: `
      <p>Hello ${full_name},</p>
      <p>Your appointment has been rescheduled. Please see the updated details below:</p>

      <p><strong>Old Details:</strong></p>
      <ul>
        <li><strong>Date:</strong> ${old_date}</li>
        <li><strong>Time:</strong> ${formatTime(old_time)}</li>
      </ul>

      <p><strong>New Details:</strong></p>
      <ul>
        <li><strong>Title:</strong> ${title}</li>
        <li><strong>Date:</strong> ${new_date}</li>
        <li><strong>Time:</strong> ${formatTime(new_time)} - ${end_time ? formatTime(end_time) : "TBD"}</li>
        <li><strong>Description:</strong> ${description || "No additional details"}</li>
      </ul>

      <p>If you have a virtual meeting, please join here:</p>
      <p><a href="https://us06web.zoom.us/j/3697746091?pwd=YXkyaUhKM3AzKzJpcitUNWRCMjNOdz09">
        https://us06web.zoom.us/j/3697746091?pwd=YXkyaUhKM3AzKzJpcitUNWRCMjNOdz09</a></p>
      <p><strong>Meeting ID:</strong> 369 774 6091</p>
      <p><strong>Passcode:</strong> Lyn</p>
      <p>Thank you!</p>
      <p>Best regards,<br/>Your Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Reschedule email sent to: ${safeJoinRecipients(recipients)}`);
  } catch (error) {
    console.error(`❌ Error sending reschedule email:`, error.message);
  }
};

export { sendTutoringRescheduleEmail };

/* ======================================================
   Appointment Cancellation Email
====================================================== */

const sendCancellationEmail = async ({ title, email, full_name, date, time, description }) => {
  const adminEmail = "stemwithlyn@gmail.com";
  const additionalRecipient = String(title || "")
    .toLowerCase()
    .includes("united mentors")
    ? "unitedmentorsllc@gmail.com"
    : null;

  const recipients = [email, adminEmail];
  if (additionalRecipient) recipients.push(additionalRecipient);

  const mailOptions = {
    from: EMAIL_USER,
    to: recipients,
    subject: `Appointment Cancellation: ${title}`,
    html: `
      <p>Hello ${full_name},</p>
      <p>We regret to inform you that your appointment has been cancelled. Please see the details below:</p>
      <ul>
        <li><strong>Title:</strong> ${title}</li>
        <li><strong>Date:</strong> ${date}</li>
        <li><strong>Time:</strong> ${formatTime(time)}</li>
        <li><strong>Description:</strong> ${description || "No additional details"}</li>
      </ul>
      <p>If you have any questions or would like to reschedule, please contact us.</p>
      <p>Thank you!</p>
      <p>Best regards,<br/>Your Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Cancellation email sent to: ${safeJoinRecipients(recipients)}`);
  } catch (error) {
    console.error(`❌ Error sending cancellation email:`, error.message);
  }
};

export { sendCancellationEmail };

/* ======================================================
   Task Alerts (Email-to-SMS)
====================================================== */

const carrierDomains = {
  att: "txt.att.net",
  verizon: "vtext.com",
  tmobile: "tmomail.net",
  boost: "sms.myboostmobile.com",
  metro: "mymetropcs.com",
};

const sendTaskTextMessage = async ({ phone, carrier, task, due_date }) => {
  try {
    const domain = carrierDomains[String(carrier || "").toLowerCase()];
    if (!domain) {
      console.error(`Unsupported carrier: ${carrier}`);
      return;
    }

    const recipient = `${String(phone).replace(/\D/g, "")}@${domain}`;

    const mailOptions = {
      from: EMAIL_USER,
      to: recipient,
      subject: "New Task Assigned",
      text: `New Task Alert!\nTask: "${task}"\nDue: ${due_date}`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Task text message sent to ${recipient}`);
  } catch (error) {
    console.error(`❌ Error sending task text message:`, error.message);
  }
};

export { sendTaskTextMessage };

const sendTextMessage = async ({ phone, carrier, message }) => {
  try {
    const domain = carrierDomains[String(carrier || "").toLowerCase()];
    if (!domain) throw new Error(`Unsupported carrier: ${carrier}`);

    const recipient = `${String(phone).replace(/\D/g, "")}@${domain}`;

    const mailOptions = {
      from: EMAIL_USER,
      to: recipient,
      subject: "Task Reminder!",
      text: message,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Text message sent to ${recipient}`);
  } catch (error) {
    console.error(`❌ Error sending text message:`, error.message);
  }
};

export { sendTextMessage };

/* ======================================================
   Mentor Session Log Email
====================================================== */

const sendMentorSessionLogEmail = async (formData) => {
  const recipients = [formData.email, "unitedmentorsllc@gmail.com"];

  const mailOptions = {
    from: EMAIL_USER,
    to: recipients,
    subject: "United Mentors Session Log Submitted",
    html: `
      <h3>New Mentor Session Log</h3>
      <p><strong>Mentor Name:</strong> ${formData.mentorName}</p>
      <p><strong>Student Name:</strong> ${formData.studentName}</p>
      <p><strong>Date:</strong> ${formData.date}</p>
      <p><strong>Time:</strong> ${formData.time}</p>
      <p><strong>Duration:</strong> ${formData.duration}</p>
      <p><strong>Skill Covered:</strong> ${(formData.skill || []).join(", ")}</p>
      <p><strong>Behavior:</strong> ${formData.behavior}</p>
      <p><strong>Communication With:</strong> ${formData.communication}</p>
      <p><strong>Details:</strong> ${formData.details}</p>
      <p><strong>Incident Report:</strong> ${formData.incident}</p>
      <p><strong>Progress:</strong> ${formData.progress}</p>
      <p><strong>Type:</strong> ${formData.type}</p>
      <p><strong>Session Details:</strong> ${formData.sessionDetails}</p>
      <p><strong>Additional Notes:</strong> ${formData.additionalNotes}</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Session log email sent to: ${safeJoinRecipients(recipients)}`);
  } catch (error) {
    console.error(`❌ Error sending session log email:`, error.message);
  }
};

export { sendMentorSessionLogEmail };

/* ======================================================
   Email Campaign
====================================================== */

const sendEmailCampaign = async (clients, subject, message) => {
  const logFile = path.join(process.cwd(), "campaign_log.txt");

  for (const client of clients || []) {
    if (!client?.email) continue;

    const mailOptions = {
      from: EMAIL_USER,
      to: client.email,
      subject,
      text: message,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${client.email}`);
      fs.appendFileSync(
        logFile,
        `[${new Date().toISOString()}] Email sent to ${client.email}\n`
      );
    } catch (error) {
      console.error(`❌ Error sending email to ${client.email}:`, error.message);
      fs.appendFileSync(
        logFile,
        `[${new Date().toISOString()}] ERROR to ${client.email}: ${error.message}\n`
      );
    }
  }
};

export { sendEmailCampaign };

/* ======================================================
   Appointment Reminder Email
====================================================== */

const sendAppointmentReminderEmail = async ({ email, full_name, date, time, title }) => {
  const mailOptions = {
    from: EMAIL_USER,
    to: email,
    subject: `Reminder: Your Appointment is Tomorrow`,
    html: `
      <p>Hello ${full_name},</p>
      <p>This is a friendly reminder that you have an upcoming appointment scheduled for tomorrow.</p>
      <ul>
        <li><strong>Title:</strong> ${title}</li>
        <li><strong>Date:</strong> ${date}</li>
        <li><strong>Time:</strong> ${formatTime(time)}</li>
      </ul>
      <p>If you have any questions or need to reschedule, feel free to reply to this email.</p>
      <p><strong>Join Zoom Meeting:</strong></p>
      <p><a href="https://us06web.zoom.us/j/3697746091?pwd=YXkyaUhKM3AzKzJpcitUNWRCMjNOdz09">
        https://us06web.zoom.us/j/3697746091?pwd=YXkyaUhKM3AzKzJpcitUNWRCMjNOdz09</a></p>
      <p><strong>Meeting ID:</strong> 369 774 6091</p>
      <p><strong>Passcode:</strong> Lyn</p>
      <p>Thank you!</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Reminder email sent to: ${email}`);
  } catch (error) {
    console.error(`❌ Error sending reminder email:`, error.message);
  }
};

export { sendAppointmentReminderEmail };

/* ======================================================
   (Optional) default export transporter if you ever need it
====================================================== */
export default transporter;
