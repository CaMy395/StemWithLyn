import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("finalizing"); // finalizing | success | error

  useEffect(() => {
    const finalizeAppointment = async () => {
      try {
        const title = searchParams.get("title");
        const client_name = searchParams.get("client_name");
        const client_email = searchParams.get("client_email");
        const client_phone = searchParams.get("client_phone");
        const date = searchParams.get("date");
        const time = searchParams.get("time");
        const end_time = searchParams.get("end_time");

        if (!title || !client_name || !client_email || !date || !time || !end_time) {
          throw new Error("Missing appointment data from query params");
        }

        const appointmentData = {
          title,
          client_name,
          client_email,
          client_phone,
          date,
          time,
          end_time,
          description: `Client booked a ${title} appointment`,
          payment_method: "Square"
        };

        const create = await fetch(`${process.env.REACT_APP_API_URL}/appointments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(appointmentData),
        });

        if (!create.ok) throw new Error("Failed to create appointment");

        setStatus("success");
      } catch (err) {
        console.error("❌ Finalizing error:", err);
        setStatus("error");
      }
    };

    finalizeAppointment();
  }, [searchParams]);

  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      {status === "finalizing" && <h2>⏳ Finalizing your appointment...</h2>}
      {status === "success" && <h2>✅ Appointment Confirmed!</h2>}
      {status === "error" && <h2>❌ Something went wrong finalizing your appointment.</h2>}
    </div>
  );
};

export default PaymentSuccess;
