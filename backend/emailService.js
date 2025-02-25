import nodemailer from 'nodemailer';
import 'dotenv/config';
import path from "path";

const formatTime = (time) => {
    if (!time || typeof time !== 'string') return 'N/A'; // Return 'N/A' if time is invalid
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes);
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
    }).format(date);
};

// Function to send the password reset email
const transporter = nodemailer.createTransport({
    service: 'gmail',  // You can replace this with another email provider if necessary
    auth: {
        user: process.env.EMAIL_USER,  // Your email address
        pass: process.env.EMAIL_PASS,  // Your email password
    },
});

const sendResetEmail = (email, resetLink) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Password Reset Request',
        html: `
            <h3>Password Reset</h3>
            <p>Click the link below to reset your password:</p>
            <a href="${resetLink}">${resetLink}</a>
        `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
};

export { sendResetEmail };


// Registration-specific email notification
const sendRegistrationEmail = async (recipient, username, name) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Replace with your email provider
        auth: {
            user: process.env.ADMIN_EMAIL,
            pass: process.env.ADMIN_PASS,
        },
    });

    const mailOptions = {
        from: process.env.ADMIN_EMAIL,
        to: recipient,
        subject: 'Welcome to Our Platform!',
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
        const info = await transporter.sendMail(mailOptions);
        console.log(`Registration email sent to ${recipient}: ${info.response}`);
    } catch (error) {
        console.error(`Error sending registration email to ${recipient}:`, error.message);
    }
};

export { sendRegistrationEmail };


const sendTutoringIntakeEmail = async (formData) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Replace with your email service
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false, // Allow self-signed certificates
        },
    });

    // Additional recipient for United Mentors Organization
    const additionalRecipient = formData.whyHelp === 'United Mentors Organization'
        ? 'easylearning@stemwithlyn.com' // Replace with the correct email address
        : null;

    const recipients = [process.env.EMAIL_USER];
    if (additionalRecipient) {
        recipients.push(additionalRecipient);
    }

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipients.join(','), // Send to multiple recipients
        subject: `Tutoring Intake Form Submission`,
        html: `
            <h3>Tutoring Intake Form Submission</h3>
            <p><strong>Full Name:</strong> ${formData.fullName}</p>
            <p><strong>Email:</strong> ${formData.email}</p>
            <p><strong>Phone:</strong> ${formData.phone}</p>
            <p><strong>Have Booked Before:</strong> ${formData.haveBooked}</p>
            <p><strong>Service Requested:</strong> ${formData.whyHelp}</p>
            ${formData.learnDisable ? `<p><strong>Learning Disability:</strong> ${formData.whatDisable || 'None'}</p>` : ''}
            <p><strong>Age:</strong> ${formData.age}</p>
            <p><strong>Grade:</strong> ${formData.grade}</p>
            <p><strong>Subject:</strong> ${formData.subject}</p>
            ${
                formData.subject === 'Math'
                    ? `<p><strong>Math Subject:</strong> ${formData.mathSubject}</p>`
                    : formData.subject === 'Science'
                    ? `<p><strong>Science Subject:</strong> ${formData.scienceSubject}</p>`
                    : ''
            }
            <p><strong>Current Grade:</strong> ${formData.currentGrade}</p>
            <p><strong>Payment Method:</strong> ${formData.paymentMethod}</p>
            <p><strong>Additional Details:</strong> ${formData.additionalDetails || 'None'}</p>
        `,
    };

    try {
        console.log('Final recipients:', recipients);

        const info = await transporter.sendMail(mailOptions);
        console.log(`Tutoring intake email sent: ${info.response}`);
    } catch (error) {
        console.error(`Error sending tutoring intake email: ${error.message}`);
    }
};

export { sendTutoringIntakeEmail };


const sendPaymentEmail = async (email, link) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Replace with your email service
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Payment Link',
        html: `<p>Please complete your payment using the following link:</p><a href="${link}" target="_blank">${link}</a>`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Payment link sent to ${email}`);
    } catch (error) {
        console.error(`Error sending payment link to ${email}:`, error.message);
    }
};

export { sendPaymentEmail };


const sendTutoringApptEmail = async ({ title, email, full_name, date, time, end_time, description }) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false, // Allow self-signed certificates
        },
    });

    // ✅ Check if "United Mentors" is in the appointment title
    const additionalRecipient = title.toLowerCase().includes("united mentors") ? "unitedmentorsllc@gmail.com" : null;
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: additionalRecipient ? [email, additionalRecipient] : email, // ✅ Send to both if condition matches
        subject: `Appointment Confirmation: ${title}`,
        html: `
            <p>Hello ${full_name},</p>
            <p>Your appointment has been scheduled. If you need to cancel or reschedule, please reply to this email.</p>
            <p><strong>Details:</strong></p>
            <ul>
                <li><strong>Title:</strong> ${title}</li>
                <li><strong>Date:</strong> ${date}</li>
                <li><strong>Time:</strong> ${formatTime(time)} - ${end_time ? formatTime(end_time) : 'TBD'}</li>
                <li><strong>Description:</strong> ${description || 'No additional details'}</li>
            </ul>
            <p>If you have a virtual meeting or interview, please join here:</p>
            <p>Caitlyn Myland is inviting you to a scheduled Zoom meeting.</p>
            <p><strong>Topic:</strong> Stem with Lyn Meeting Room</p>
            <p><strong>Join Zoom Meeting:</strong></p>
            <p><a href="https://us06web.zoom.us/j/3697746091?pwd=YXkyaUhKM3AzKzJpcitUNWRCMjNOdz09">https://us06web.zoom.us/j/3697746091?pwd=YXkyaUhKM3AzKzJpcitUNWRCMjNOdz09</a></p>
            <p><strong>Meeting ID:</strong> 369 774 6091</p>
            <p><strong>Passcode:</strong> Lyn</p>
            <p>Thank you!</p>
            <p>Best regards,<br>Your Team</p>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Tutoring appointment email sent to ${email}${additionalRecipient ? ` and ${additionalRecipient}` : ''}`);
    } catch (error) {
        console.error(`Error sending tutoring appointment email to ${email}:`, error.message);
    }
};

export { sendTutoringApptEmail };



// Function specifically for appointment emails
const sendTutoringRescheduleEmail = async ({ title, email, full_name, old_date, old_time, new_date, new_time, end_time, description }) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false, // Allow self-signed certificates
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
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
                <li><strong>Time:</strong> ${formatTime(new_time)} - ${end_time ? formatTime(end_time) : 'TBD'}</li>
                <li><strong>Description:</strong> ${description || 'No additional details'}</li>
            </ul>
            <p>If you have a virtual meeting or interview, please join here:</p>
            <p>Caitlyn Myland is inviting you to a scheduled Zoom meeting.</p>
            <p><strong>Topic:</strong> Stem with Lyn Meeting Room</p>
            <p><strong>Join Zoom Meeting:</strong></p>
            <p><a href="https://us06web.zoom.us/j/3697746091?pwd=YXkyaUhKM3AzKzJpcitUNWRCMjNOdz09">https://us06web.zoom.us/j/3697746091?pwd=YXkyaUhKM3AzKzJpcitUNWRCMjNOdz09</a></p>
            <p><strong>Meeting ID:</strong> 369 774 6091</p>
            <p><strong>Passcode:</strong> Lyn</p>
            <p>Thank you!</p>
            <p>Best regards,<br>Your Team</p>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Tutoring reschedule email sent to ${email}`);
    } catch (error) {
        console.error(`Error sending tutoring reschedule email to ${email}:`, error.message);
    }
};

export { sendTutoringRescheduleEmail };

const sendCancellationEmail = async ({ title, email, full_name, date, time, description }) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false, // Allow self-signed certificates
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Appointment Cancellation: ${title}`,
        html: `
            <p>Hello ${full_name},</p>
            <p>We regret to inform you that your appointment has been cancelled. Please see the details below:</p>
            <p><strong>Details:</strong></p>
            <ul>
                <li><strong>Title:</strong> ${title}</li>
                <li><strong>Date:</strong> ${date}</li>
                <li><strong>Time:</strong> ${formatTime(time)}</li>
                <li><strong>Description:</strong> ${description || 'No additional details'}</li>
            </ul>
            <p>If you have any questions or would like to reschedule, please contact us.</p>
            <p>Thank you!</p>
            <p>Best regards,<br>Your Team</p>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Cancellation email sent to ${email}`);
    } catch (error) {
        console.error(`Error sending cancellation email to ${email}:`, error.message);
    }
};

export { sendCancellationEmail };

//Task Alerts
const sendTaskTextMessage = async ({ phone, carrier, task, due_date }) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false,
        },
    });

    // Carrier domains mapping
    const carrierDomains = {
        att: 'txt.att.net',
        verizon: 'vtext.com',
        tmobile: 'tmomail.net',
        boost: 'sms.myboostmobile.com',
        metro: 'mymetropcs.com',
    };

    const carrierDomain = carrierDomains[carrier.toLowerCase()];
    if (!carrierDomain) {
        console.error(`Unsupported carrier: ${carrier}`);
        return;
    }

    const recipient = `${phone}@${carrierDomain}`;
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipient,
        subject: 'New Task Assigned', // Subject is ignored in SMS
        text: `New Task Alert!\nTask: "${task}"\nDue: ${due_date}`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Task text message sent to ${recipient}`);
    } catch (error) {
        console.error(`Error sending task text message to ${recipient}:`, error.message);
    }
};
export { sendTaskTextMessage };

const sendTextMessage = async ({ phone, carrier, message }) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Replace with your email service
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false, // Allow self-signed certificates
        },
    });

    // Map of carrier domains
    const carrierDomains = {
        att: 'txt.att.net',
        verizon: 'vtext.com',
        tmobile: 'tmomail.net',
        boost: 'sms.myboostmobile.com',
        metro: 'mymetropcs.com',
    };

    const carrierDomain = carrierDomains[carrier.toLowerCase()];
    if (!carrierDomain) {
        throw new Error(`Unsupported carrier: ${carrier}`);
    }
    

    const recipient = `${phone}@${carrierDomain}`;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipient,
        subject: 'Task Reminder!', // Subject is ignored by SMS
        text: message, // SMS content goes here
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Text message sent to ${recipient}`);
    } catch (error) {
        console.error(`Error sending text message to ${recipient}:`, error.message);
    }
};
export { sendTextMessage };



// Function to Send Email Campaign
const sendEmailCampaign = async (clients, subject, message) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false, // Allow self-signed certificates
        },
      });

  const logFile = path.join(process.cwd(), "campaign_log.txt");

  for (const client of clients) {
    if (!client.email) continue;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: client.email,
      subject: subject,
      text: message,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${client.email}`);
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] Email sent to ${client.email}\n`);
    } catch (error) {
      console.error(`❌ Error sending email to ${client.email}:`, error.message);
    }
  }
};

export { sendEmailCampaign };
