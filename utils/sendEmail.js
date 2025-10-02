const nodemailer = require('nodemailer');

const sendEmail = async (to, subject, text) => {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', // Gmail SMTP server
      port: 587,
      secure: false, // Use TLS
      auth: {
        user: process.env.EMAIL_USERNAME, // no-replyesycle12@gmail.com
        pass: process.env.EMAIL_PASSWORD  // Your Gmail app password
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    await transporter.verify();
    console.log('Server is ready to take our messages');

    const mailOptions = {
      from: `"Esycles" <${process.env.EMAIL_USERNAME}>`,
      to,
      subject,
      text,
      html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
               <h2 style="color: #4F46E5;">Esycles</h2>
               <p>${text.replace(/\n/g, '<br>')}</p>
               <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;">
               <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
             </div>`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Message sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Email sending error:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

module.exports = sendEmail;